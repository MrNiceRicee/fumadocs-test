import { z, type ZodError } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']),
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