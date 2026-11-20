import 'dotenv/config';
import pino from 'pino';
import { loadEnv } from './config/env.js';
import { connectMongo } from './db/mongo.js';
import { createDynamoClients, ensureAuditTable } from './db/dynamo.js';
import { ValidationsRepository } from './repositories/validations.repository.js';
import { AuditRepository } from './repositories/audit.repository.js';
import { EnrichmentService } from './services/enrichment.service.js';
import { ValidationsService } from './services/validations.service.js';
import { createApp } from './app.js';

const logger = pino({ name: 'server' });

async function main() {
  const env = loadEnv();

  await connectMongo(env.MONGO_URI);

  const { rawClient, docClient } = createDynamoClients({
    endpoint: env.DYNAMODB_ENDPOINT,
    region: env.AWS_REGION,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  });
  await ensureAuditTable(rawClient, env.AUDIT_TABLE_NAME);

  const enrichmentService = new EnrichmentService({
    baseUrl: env.COUNTRIES_API_URL,
    countryCode: env.DEFAULT_COUNTRY_CODE,
    timeoutMs: env.EXTERNAL_API_TIMEOUT_MS,
    retries: env.EXTERNAL_API_RETRIES,
  });

  const validationsRepository = new ValidationsRepository();
  const auditRepository = new AuditRepository(docClient, env.AUDIT_TABLE_NAME);

  const validationsService = new ValidationsService({
    enrichmentService,
    validationsRepository,
    auditRepository,
  });

  const app = createApp({ validationsService });

  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'Server listening');
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
