import {
  loader,
  type MetaData,
  type PageData,
  type Source,
  type VirtualFile,
} from 'fumadocs-core/source';
import matter from 'gray-matter';
import * as path from 'node:path';
import { env } from './util/env';

/**
 * Process files from local filesystem
 */
function getLocalFiles(): VirtualFile[] {
  const files = Object.entries(
    import.meta.glob<true, 'raw'>('/content/docs/**/*', {
      eager: true,
      query: '?raw',
      import: 'default',
    }),
  );

  return files.flatMap(([file, content]) => {
    const ext = path.extname(file);
    const virtualPath = path.relative(
      'content/docs',
      path.join(process.cwd(), file),
    );

    if (ext === '.mdx' || ext === '.md') {
      const parsed = matter(content);

      return {
        type: 'page',
        path: virtualPath,
        data: {
          ...parsed.data,
          content: parsed.content,
        },
      };
    }

    if (ext === '.json') {
      return {
        type: 'meta',
        path: virtualPath,
        data: JSON.parse(content),
      };
    }

    return [];
  });
}

/**
 * GitHub API type definitions
 */
interface GitHubTreeResponse {
  sha: string;
  url: string;
  truncated: boolean;
  tree: GitHubTreeItem[];
}

interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  size?: number;
  url: string;
}

interface GitHubRateLimitInfo {
  limit: number;
  remaining: number;
  reset: Date;
  used: number;
}

/**
 * Custom error classes for GitHub API errors
 */
class GitHubApiError extends Error {
  statusCode: number;
  
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'GitHubApiError';
    this.statusCode = statusCode;
  }
}

class GitHubRateLimitError extends GitHubApiError {
  rateLimitInfo: GitHubRateLimitInfo;
  
  constructor(message: string, rateLimitInfo: GitHubRateLimitInfo) {
    super(message, 403);
    this.name = 'GitHubRateLimitError';
    this.rateLimitInfo = rateLimitInfo;
  }
}

/**
 * Parse GitHub rate limit headers into a structured object
 */
function parseRateLimitHeaders(headers: Headers): GitHubRateLimitInfo | null {
  const limit = headers.get('x-ratelimit-limit');
  const remaining = headers.get('x-ratelimit-remaining');
  const reset = headers.get('x-ratelimit-reset');
  const used = headers.get('x-ratelimit-used');
  
  if (!limit || !remaining || !reset || !used) {
    return null;
  }
  
  return {
    limit: parseInt(limit),
    remaining: parseInt(remaining),
    reset: new Date(parseInt(reset) * 1000),
    used: parseInt(used),
  };
}

/**
 * Log rate limit information in a readable format
 */
function logRateLimitInfo(rateLimitInfo: GitHubRateLimitInfo | null): void {
  if (!rateLimitInfo) {
    console.log('No rate limit information available');
    return;
  }
  
  const resetTime = rateLimitInfo.reset.toLocaleString();
  const usagePercentage = ((rateLimitInfo.used / rateLimitInfo.limit) * 100).toFixed(1);
  
  console.log(`GitHub API Rate Limit Info:
  - Used: ${rateLimitInfo.used}/${rateLimitInfo.limit} (${usagePercentage}%)
  - Remaining: ${rateLimitInfo.remaining}
  - Resets at: ${resetTime}
  `);
}

function getGitHubHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Accept': 'application/vnd.github.v3+json',
  };
  
  if (env.GITHUB_TOKEN) {
    headers['Authorization'] = `token ${env.GITHUB_TOKEN}`;
  }
  
  return headers;
}

/**
 * Fetch and process files from GitHub
 */
async function getGitHubFiles(): Promise<VirtualFile[]> {
  if (!env.GITHUB_OWNER || !env.GITHUB_REPO) {
    throw new Error('GitHub configuration is missing');
  }

  try {
    const headers = getGitHubHeaders();
    
    const apiUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/git/trees/${env.GITHUB_CONTENT_BRANCH}?recursive=1`;
    const response = await fetch(apiUrl, { headers });
    
    // Log rate limit info for diagnostics
    const rateLimitInfo = parseRateLimitHeaders(response.headers);
    logRateLimitInfo(rateLimitInfo);
    
    if (!response.ok) {
      if (rateLimitInfo && rateLimitInfo.remaining === 0) {
        throw new GitHubRateLimitError(
          `GitHub API rate limit exceeded. Rate limit will reset at ${rateLimitInfo.reset.toLocaleString()}`,
          rateLimitInfo
        );
      }
      
      throw new GitHubApiError(
        `GitHub API error: ${response.statusText}`,
        response.status
      );
    }
    
    const data = await response.json() as GitHubTreeResponse;
    
    const contentFiles = data.tree
      .filter((item: GitHubTreeItem) => 
        item.type === 'blob' && 
        item.path.startsWith(env.GITHUB_CONTENT_PATH)
      );
    
    const virtualFilesResults = await Promise.allSettled(
      contentFiles.map(async (file: GitHubTreeItem) => {
        const fileUrl = `https://raw.githubusercontent.com/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/${env.GITHUB_CONTENT_BRANCH}/${file.path}`;
        const fileResponse = await fetch(fileUrl, { headers });
        
        if (!fileResponse.ok) {
          console.error(`Failed to fetch file: ${file.path}`);
          return null;
        }
        
        const content = await fileResponse.text();
        const ext = path.extname(file.path);
        const virtualPath = path.relative(
          env.GITHUB_CONTENT_PATH,
          file.path,
        );
        
        if (ext === '.mdx' || ext === '.md') {
          const parsed = matter(content);
          
          return {
            type: 'page',
            path: virtualPath,
            data: {
              ...parsed.data,
              content: parsed.content,
            },
          };
        }
        
        if (ext === '.json') {
          return {
            type: 'meta',
            path: virtualPath,
            data: JSON.parse(content),
          };
        }
        
        return null;
      })
    );
    
    const virtualFiles = virtualFilesResults
      .filter((result): result is PromiseFulfilledResult<VirtualFile | null> => 
        result.status === 'fulfilled')
      .map(result => result.value)
      .filter(Boolean) as VirtualFile[];
    
    return virtualFiles;
  } catch (error) {
    if (error instanceof GitHubRateLimitError) {
      console.error(`Rate limit exceeded. Reset at ${error.rateLimitInfo.reset.toLocaleString()}`);
    } else if (error instanceof GitHubApiError) {
      console.error(`GitHub API error (${error.statusCode}): ${error.message}`);
    } else {
      console.error('Error fetching files from GitHub:', error);
    }
    throw error;
  }
}


type CustomSourceData = {
  pageData: PageData & { content: string };
  metaData: MetaData;
};

const getFiles = async () => {
  const files = env.NODE_ENV === 'development' ? getLocalFiles() : await getGitHubFiles();
  console.info(`${env.NODE_ENV} Loaded ${files.length} files`);
  return files;
}

const virtualFiles = await getFiles();

export const source = loader({
  source: {
    files: virtualFiles,
  } as Source<CustomSourceData>,
  baseUrl: '/docs',
});

