# Fumadocs with GitHub Content Source

This is a Fumadocs documentation site using React Router, with the ability to source documentation content from either:
- Local files in development mode
- GitHub repository in production mode

## Getting Started

### Development Mode (Local Content)

1. Clone this repository
2. Install dependencies: `npm install` or `pnpm install`
3. Start the development server: `npm run dev`

This will use the local files in the `content/docs` directory as the source for your documentation.

### Production Mode (GitHub Content)

To use GitHub as your content source in production:

1. Copy `example.env` to `.env` and configure your GitHub settings:
   ```
   NODE_ENV=production
   GITHUB_OWNER=yourusername
   GITHUB_REPO=your-repo-name
   GITHUB_CONTENT_PATH=content/docs
   GITHUB_CONTENT_BRANCH=main
   GITHUB_TOKEN=your_github_token  # Recommended for higher rate limits
   ```

   > **Note:** A GitHub token is strongly recommended for production use to avoid rate limiting. Create a Personal Access Token with `repo` scope (or `public_repo` for public repositories) at https://github.com/settings/tokens

2. Build and start the production server:
   ```
   npm run build
   npm run start
   ```

## How It Works

The site dynamically loads content based on the environment:

- In development, it reads files directly from your local `content/docs` directory
- In production, it fetches files from the specified GitHub repository path

This allows you to keep your documentation in a separate repository or branch, while your documentation site stays lean.

### Benefits of Using a GitHub Token

- **Higher API rate limits**: 5,000 requests/hour vs 60 requests/hour without a token
- **Access to private repositories**: Fetch content from private repos
- **Better reliability**: Reduces the chance of hitting rate limits in production
- **Detailed rate limit information**: Better error handling for rate limiting
