import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { AppError } from '../../src/errors/app-error.js';

function createTestApp(serviceOverrides = {}) {
  const defaultService = {
    create: vi.fn().mockResolvedValue('507f1f77bcf86cd799439011'),
    findById: vi.fn().mockResolvedValue(null),
    ...serviceOverrides,
  };
  return createApp({ validationsService: defaultService });
}

describe('Routes', () => {
  describe('GET /health', () => {
    it('returns 200 { status: ok }', async () => {
      const app = createTestApp();
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });

  describe('POST /validations', () => {
    it('returns 400 VALIDATION_ERROR for invalid body', async () => {
      const app = createTestApp();
      const res = await request(app)
        .post('/validations')
        .send({ name: '', documentNumber: '' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toBeDefined();
      expect(res.body.error.details.length).toBeGreaterThan(0);
    });

    it('returns 201 with id on valid input', async () => {
      const app = createTestApp();
      const res = await request(app)
        .post('/validations')
        .send({ name: 'Juan Pérez', documentNumber: 'DOC12345' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ id: '507f1f77bcf86cd799439011' });
    });

    it('returns 400 for malformed JSON', async () => {
      const app = createTestApp();
      const res = await request(app)
        .post('/validations')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /validations/:id', () => {
    it('returns 400 INVALID_ID for a malformed id', async () => {
      const app = createTestApp();
      const res = await request(app).get('/validations/not-a-valid-id');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ID');
    });

    it('returns 404 NOT_FOUND for a non-existent id', async () => {
      const app = createTestApp();
      const res = await request(app).get('/validations/507f1f77bcf86cd799439011');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 200 with the record when found', async () => {
      const record = {
        id: '507f1f77bcf86cd799439011',
        name: 'Juan Pérez',
        documentNumber: 'DOC12345',
        enrichment: { country: 'Colombia' },
        createdAt: '2024-01-15T10:00:00.000Z',
      };
      const app = createTestApp({ findById: vi.fn().mockResolvedValue(record) });
      const res = await request(app).get('/validations/507f1f77bcf86cd799439011');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('507f1f77bcf86cd799439011');
      expect(res.body.name).toBe('Juan Pérez');
    });
  });

  describe('Unknown route', () => {
    it('returns 404 NOT_FOUND', async () => {
      const app = createTestApp();
      const res = await request(app).get('/does-not-exist');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('Unexpected errors', () => {
    it('returns 500 INTERNAL_ERROR without stack trace', async () => {
      const app = createTestApp({
        create: vi.fn().mockRejectedValue(new Error('Something broke')),
      });
      const res = await request(app)
        .post('/validations')
        .send({ name: 'Juan Pérez', documentNumber: 'DOC12345' });

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
      expect(res.body.error.message).not.toContain('Something broke');
      expect(res.body.error.stack).toBeUndefined();
    });
  });
});
