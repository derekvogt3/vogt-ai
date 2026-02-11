import { z } from 'zod';

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  PORT: z.coerce.number().default(3000),
});

export const env = envSchema.parse(process.env);
