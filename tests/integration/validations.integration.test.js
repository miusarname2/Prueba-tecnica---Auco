import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { DynamoDBClient, DeleteTableCommand } from '@aws-sdk/client-dynamodb';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { ValidationsService } from '../../src/services/validations.service.js';
import { EnrichmentService } from '../../src/services/enrichment.service.js';
import { ValidationsRepository } from '../../src/repositories/validations.repository.js';
import { AuditRepository } from '../../src/repositories/audit.repository.js';
import { createDynamoClients, ensureAuditTable } from '../../src/db/dynamo.js';

const TEST_MONGO_URI = 'mongodb://localhost:27017/validations_integration_test';
const TEST_TABLE_NAME = 'validations-audit-integration-test';
const DYNAMO_ENDPOINT = 'http://localhost:8000';

const MOCK_ENRICHMENT = {
  name: 'Colombia',
  code: 'CO',
  alpha3Code: 'COL',
  capital: 'Bogotá',
  region: 'Americas',
  subregion: 'South America',
  population: 53425635,
  languages: ['Spanish'],
  currency: 'COP',
  flag: '🇨🇴',
  callingCode: '+57',
};

let app;
let dynamoDocClient;
let dynamoRawClient;

beforeAll(async () => {
  await mongoose.connect(TEST_MONGO_URI);

  const clients = createDynamoClients({
    endpoint: DYNAMO_ENDPOINT,
    region: 'us-east-1',
    accessKeyId: 'local',
    secretAccessKey: 'local',
  });
  dynamoRawClient = clients.rawClient;
  dynamoDocClient = clients.docClient;

  await ensureAuditTable(dynamoRawClient, TEST_TABLE_NAME);

  const fakeFetch = async () => ({
    status: 200,
    json: async () => MOCK_ENRICHMENT,
  });

  const enrichmentService = new EnrichmentService({
    baseUrl: 'https://api.example.com',
    countryCode: 'CO',
    timeoutMs: 5000,
    retries: 1,
    fetchFn: fakeFetch,
  });

  const validationsRepository = new ValidationsRepository();
  const auditRepository = new AuditRepository(dynamoDocClient, TEST_TABLE_NAME);

  const validationsService = new ValidationsService({
    enrichmentService,
    validationsRepository,
    auditRepository,
  });

  app = createApp({ validationsService });
});

afterAll(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();

  try {
    await dynamoRawClient.send(new DeleteTableCommand({ TableName: TEST_TABLE_NAME }));
  } catch {
  }
});

describe('Integration: POST + GET /validations', () => {
  it('POST creates a record and GET retrieves it with enrichment', async () => {
    const postRes = await request(app)
      .post('/validations')
      .send({ name: 'Juan Pérez', documentNumber: 'DOC12345' });

    expect(postRes.status).toBe(201);
    expect(postRes.body.id).toBeDefined();

    const { id } = postRes.body;

    const getRes = await request(app).get(`/validations/${id}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(id);
    expect(getRes.body.name).toBe('Juan Pérez');
    expect(getRes.body.documentNumber).toBe('DOC12345');
    expect(getRes.body.enrichment.country).toBe('Colombia');
    expect(getRes.body.enrichment.officialName).toBe('Colombia');
    expect(getRes.body.enrichment.region).toBe('Americas');
    expect(getRes.body.enrichment.capital).toBe('Bogotá');
    expect(getRes.body.enrichment.currencyCode).toBe('COP');
    expect(getRes.body.enrichment.currencyName).toBe('COP');
    expect(getRes.body.enrichment.source).toBe('countries-api');
    expect(getRes.body.createdAt).toBeDefined();
    expect(getRes.body._id).toBeUndefined();
    expect(getRes.body.__v).toBeUndefined();
  });

  it('POST writes exactly one audit item in DynamoDB with correct format', async () => {
    const postRes = await request(app)
      .post('/validations')
      .send({ name: 'Ana García', documentNumber: 'AUDIT99999' });

    expect(postRes.status).toBe(201);
    const { id } = postRes.body;

    const queryResult = await dynamoDocClient.send(
      new QueryCommand({
        TableName: TEST_TABLE_NAME,
        KeyConditionExpression: 'documentNumber = :dn',
        ExpressionAttributeValues: { ':dn': 'AUDIT99999' },
      }),
    );

    expect(queryResult.Items).toHaveLength(1);

    const item = queryResult.Items[0];
    expect(item.documentNumber).toBe('AUDIT99999');
    expect(item.eventType).toBe('VALIDATION_CREATED');
    expect(item.validationId).toBe(id);
    expect(item.createdAt).toBeDefined();
    expect(item.eventKey).toContain('#');
    const [isoTimestamp, eventId] = item.eventKey.split('#');
    expect(eventId).toBe(id);
    expect(new Date(isoTimestamp).toISOString()).toBe(isoTimestamp);
  });

  it('two POSTs with the same documentNumber create two distinct audit events', async () => {
    const doc = 'MULTI77777';

    const res1 = await request(app)
      .post('/validations')
      .send({ name: 'Carlos Ruiz', documentNumber: doc });
    const res2 = await request(app)
      .post('/validations')
      .send({ name: 'Carlos Ruiz', documentNumber: doc });

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res1.body.id).not.toBe(res2.body.id);

    const queryResult = await dynamoDocClient.send(
      new QueryCommand({
        TableName: TEST_TABLE_NAME,
        KeyConditionExpression: 'documentNumber = :dn',
        ExpressionAttributeValues: { ':dn': doc },
      }),
    );

    expect(queryResult.Items).toHaveLength(2);
    const eventKeys = queryResult.Items.map((i) => i.eventKey);
    expect(new Set(eventKeys).size).toBe(2);
  });
});
