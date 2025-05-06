import { z, type ZodError } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']),
  GITHUB_OWNER: z.string().optional(),
  GITHUB_REPO: z.string().optional(),
  GITHUB_CONTENT_PATH: z.string().optional().default('content/docs'),
  GITHUB_CONTENT_BRANCH: z.string().optional().default('main'),
  GITHUB_TOKEN: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.NODE_ENV === 'production') {
    if (!data.GITHUB_OWNER) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'GITHUB_OWNER is required in production mode.',
        path: ['GITHUB_OWNER'],
      });
    }
    if (!data.GITHUB_REPO) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'GITHUB_REPO is required in production mode.',
        path: ['GITHUB_REPO'],
      });
    }
    if (!data.GITHUB_CONTENT_PATH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'GITHUB_CONTENT_PATH is required in production mode.',
        path: ['GITHUB_CONTENT_PATH'],
      });
    }
    // Token is recommended but not required
    if (!data.GITHUB_TOKEN) {
      console.warn('GITHUB_TOKEN is not set. You may encounter rate limiting issues.');
    }
  }
});

const humanReadableZodError = (error: ZodError) => {
  return error.errors.map((error) => `${error.path.join('.')}: ${error.message}`).join('\n');
}

const validateEnv = () => {
  const env = envSchema.safeParse(process.env);
  if (!env.success) {
    const message = humanReadableZodError(env.error);
    console.error(message);
    throw new Error(message);
  }

  return env.data;
}

export const env = validateEnv();