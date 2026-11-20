import serverless from 'serverless-http';
import mongoose from 'mongoose';
import { loadEnv } from './config/env.js';
import { createDynamoClients, ensureAuditTable } from './db/dynamo.js';
import { ValidationsRepository } from './repositories/validations.repository.js';
import { AuditRepository } from './repositories/audit.repository.js';
import { EnrichmentService } from './services/enrichment.service.js';
import { ValidationsService } from './services/validations.service.js';
import { createApp } from './app.js';

let cachedApp;
let cachedDocClient;

async function bootstrap() {
  if (cachedApp) return cachedApp;

  const env = loadEnv();

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(env.MONGO_URI);
  }

  if (!cachedDocClient) {
    const { rawClient, docClient } = createDynamoClients({
      endpoint: env.DYNAMODB_ENDPOINT,
      region: env.AWS_REGION,
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    });
    await ensureAuditTable(rawClient, env.AUDIT_TABLE_NAME);
    cachedDocClient = docClient;
  }

  const enrichmentService = new EnrichmentService({
    baseUrl: env.COUNTRIES_API_URL,
    countryCode: env.DEFAULT_COUNTRY_CODE,
    timeoutMs: env.EXTERNAL_API_TIMEOUT_MS,
    retries: env.EXTERNAL_API_RETRIES,
  });

  const validationsRepository = new ValidationsRepository();
  const auditRepository = new AuditRepository(cachedDocClient, env.AUDIT_TABLE_NAME);

  const validationsService = new ValidationsService({
    enrichmentService,
    validationsRepository,
    auditRepository,
  });

  cachedApp = createApp({ validationsService });
  return cachedApp;
}

export const handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const app = await bootstrap();
  const serverlessHandler = serverless(app);
  return serverlessHandler(event, context);
};
