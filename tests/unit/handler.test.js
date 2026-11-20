import { describe, it, expect, vi } from 'vitest';

vi.mock('mongoose', async () => {
  const actual = await vi.importActual('mongoose');
  return {
    ...actual,
    default: {
      ...actual.default,
      connection: { readyState: 1 },
      connect: vi.fn().mockResolvedValue(undefined),
    },
  };
});

vi.mock('../../src/db/dynamo.js', () => ({
  createDynamoClients: vi.fn(() => ({ rawClient: {}, docClient: {} })),
  ensureAuditTable: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/models/validation.model.js', () => ({
  ValidationModel: {
    create: vi.fn().mockResolvedValue({
      _id: { toString: () => '507f1f77bcf86cd799439011' },
      createdAt: new Date('2024-01-15T10:00:00Z'),
    }),
    findById: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
  },
}));

vi.mock('../../src/services/enrichment.service.js', () => ({
  EnrichmentService: vi.fn().mockImplementation(() => ({
    enrich: vi.fn().mockResolvedValue({
      country: 'Colombia',
      officialName: 'Republic of Colombia',
      region: 'Americas',
      capital: 'Bogotá',
      currencyCode: 'COP',
      currencyName: 'Colombian peso',
      source: 'restcountries',
    }),
  })),
}));

vi.mock('../../src/repositories/audit.repository.js', () => ({
  AuditRepository: vi.fn().mockImplementation(() => ({
    putValidationCreated: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../src/config/env.js', () => ({
  loadEnv: vi.fn(() => ({
    PORT: 3000,
    MONGO_URI: 'mongodb://localhost:27017/test',
    DYNAMODB_ENDPOINT: 'http://localhost:8000',
    AWS_REGION: 'us-east-1',
    AWS_ACCESS_KEY_ID: 'local',
    AWS_SECRET_ACCESS_KEY: 'local',
    AUDIT_TABLE_NAME: 'test-table',
    COUNTRIES_API_URL: 'https://api.example.com',
    DEFAULT_COUNTRY_CODE: 'CO',
    EXTERNAL_API_TIMEOUT_MS: 5000,
    EXTERNAL_API_RETRIES: 1,
  })),
}));

describe('Serverless handler', () => {
  it('responds to a simulated API Gateway GET /health event', async () => {
    const { handler } = await import('../../src/handler.js');

    const event = {
      httpMethod: 'GET',
      path: '/health',
      headers: { 'Content-Type': 'application/json' },
      queryStringParameters: null,
      body: null,
      isBase64Encoded: false,
    };

    const context = { callbackWaitsForEmptyEventLoop: true };
    const response = await handler(event, context);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(context.callbackWaitsForEmptyEventLoop).toBe(false);
  });

  it('responds to a simulated POST /validations event', async () => {
    const { handler } = await import('../../src/handler.js');

    const event = {
      httpMethod: 'POST',
      path: '/validations',
      headers: { 'Content-Type': 'application/json' },
      queryStringParameters: null,
      body: JSON.stringify({ name: 'Juan Pérez', documentNumber: 'DOC12345' }),
      isBase64Encoded: false,
    };

    const context = { callbackWaitsForEmptyEventLoop: true };
    const response = await handler(event, context);

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.id).toBeDefined();
  });
});
