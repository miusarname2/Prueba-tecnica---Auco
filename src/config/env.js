import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  MONGO_URI: z.string().url(),
  DYNAMODB_ENDPOINT: z.string().url(),
  AWS_REGION: z.string().min(1).default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().min(1).default('local'),
  AWS_SECRET_ACCESS_KEY: z.string().min(1).default('local'),
  AUDIT_TABLE_NAME: z.string().min(1).default('validations-audit'),
  COUNTRIES_API_URL: z.string().url(),
  DEFAULT_COUNTRY_CODE: z.string().min(1).default('CO'),
  EXTERNAL_API_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  EXTERNAL_API_RETRIES: z.coerce.number().int().min(0).default(1),
});

export function loadEnv(source = process.env) {
  return envSchema.parse(source);
}
