import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ValidationsService } from '../../src/services/validations.service.js';

function makeEnrichmentOk() {
  return {
    enrich: vi.fn().mockResolvedValue({
      country: 'Colombia',
      officialName: 'Colombia',
      region: 'Americas',
      capital: 'Bogotá',
      currencyCode: 'COP',
      currencyName: 'COP',
      source: 'countries-api',
    }),
  };
}

function makeRepo() {
  return {
    create: vi.fn().mockResolvedValue({
      _id: { toString: () => '507f1f77bcf86cd799439011' },
      createdAt: new Date('2024-01-15T10:00:00Z'),
    }),
    findById: vi.fn(),
  };
}

function makeAudit() {
  return {
    putValidationCreated: vi.fn().mockResolvedValue(undefined),
  };
}

describe('ValidationsService', () => {
  it('happy path: enriches, saves to Mongo, and writes audit', async () => {
    const enrichmentService = makeEnrichmentOk();
    const validationsRepository = makeRepo();
    const auditRepository = makeAudit();

    const service = new ValidationsService({ enrichmentService, validationsRepository, auditRepository });
    const id = await service.create({ name: 'Juan', documentNumber: 'DOC12345' });

    expect(id).toBe('507f1f77bcf86cd799439011');
    expect(enrichmentService.enrich).toHaveBeenCalledOnce();
    expect(validationsRepository.create).toHaveBeenCalledOnce();
    expect(auditRepository.putValidationCreated).toHaveBeenCalledWith({
      documentNumber: 'DOC12345',
      validationId: '507f1f77bcf86cd799439011',
      createdAt: '2024-01-15T10:00:00.000Z',
    });
  });

  it('if enrichment fails, neither Mongo nor DynamoDB are called', async () => {
    const enrichmentService = { enrich: vi.fn().mockRejectedValue(new Error('API down')) };
    const validationsRepository = makeRepo();
    const auditRepository = makeAudit();

    const service = new ValidationsService({ enrichmentService, validationsRepository, auditRepository });

    await expect(service.create({ name: 'Juan', documentNumber: 'DOC12345' }))
      .rejects.toThrow();

    expect(validationsRepository.create).not.toHaveBeenCalled();
    expect(auditRepository.putValidationCreated).not.toHaveBeenCalled();
  });

  it('if DynamoDB fails, still returns the id (Mongo is source of truth)', async () => {
    const enrichmentService = makeEnrichmentOk();
    const validationsRepository = makeRepo();
    const auditRepository = {
      putValidationCreated: vi.fn().mockRejectedValue(new Error('DynamoDB down')),
    };

    const service = new ValidationsService({ enrichmentService, validationsRepository, auditRepository });
    const id = await service.create({ name: 'Juan', documentNumber: 'DOC12345' });

    expect(id).toBe('507f1f77bcf86cd799439011');
    expect(validationsRepository.create).toHaveBeenCalledOnce();
  });
});
