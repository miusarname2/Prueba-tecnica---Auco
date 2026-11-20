import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ValidationsService } from '../../src/services/validations.service.js';

function makeEnrichmentOk() {
  return {
    enrich: vi.fn().mockResolvedValue({
      country: 'Colombia',
      alpha3Code: 'COL',
      region: 'Americas',
      subregion: 'South America',
      capital: 'Bogotá',
      population: 53425635,
      languages: ['Spanish'],
      currency: 'COP',
      flag: '🇨🇴',
      callingCode: '+57',
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
    putEvent: vi.fn().mockResolvedValue(undefined),
  };
}

describe('ValidationsService', () => {
  it('happy path: enriches, saves to Mongo, and writes audit', async () => {
    const enrichmentService = makeEnrichmentOk();
    const validationsRepository = makeRepo();
    const auditRepository = makeAudit();

    const service = new ValidationsService({ enrichmentService, validationsRepository, auditRepository });
    const id = await service.create({ name: 'Juan', documentNumber: 'DOC12345', countryCode: 'CO' });

    expect(id).toBe('507f1f77bcf86cd799439011');
    expect(enrichmentService.enrich).toHaveBeenCalledWith('CO');
    expect(validationsRepository.create).toHaveBeenCalledOnce();
    expect(auditRepository.putValidationCreated).toHaveBeenCalledWith({
      documentNumber: 'DOC12345',
      validationId: '507f1f77bcf86cd799439011',
      createdAt: '2024-01-15T10:00:00.000Z',
    });
  });

  it('passes undefined countryCode when not provided (uses default)', async () => {
    const enrichmentService = makeEnrichmentOk();
    const validationsRepository = makeRepo();
    const auditRepository = makeAudit();

    const service = new ValidationsService({ enrichmentService, validationsRepository, auditRepository });
    await service.create({ name: 'Juan', documentNumber: 'DOC12345' });

    expect(enrichmentService.enrich).toHaveBeenCalledWith(undefined);
  });

  it('if enrichment fails, writes ENRICHMENT_FAILED audit event and re-throws', async () => {
    const enrichmentService = { enrich: vi.fn().mockRejectedValue(new Error('API down')) };
    const validationsRepository = makeRepo();
    const auditRepository = makeAudit();

    const service = new ValidationsService({ enrichmentService, validationsRepository, auditRepository });

    await expect(service.create({ name: 'Juan', documentNumber: 'DOC12345' }))
      .rejects.toThrow('API down');

    expect(validationsRepository.create).not.toHaveBeenCalled();
    expect(auditRepository.putValidationCreated).not.toHaveBeenCalled();

    expect(auditRepository.putEvent).toHaveBeenCalledOnce();
    const call = auditRepository.putEvent.mock.calls[0][0];
    expect(call.documentNumber).toBe('DOC12345');
    expect(call.eventType).toBe('ENRICHMENT_FAILED');
    expect(call.validationId).toBeNull();
    expect(call.errorMessage).toBe('API down');
    expect(call.createdAt).toBeDefined();
  });

  it('if Mongo write fails, writes MONGO_WRITE_FAILED audit event and re-throws', async () => {
    const enrichmentService = makeEnrichmentOk();
    const validationsRepository = {
      create: vi.fn().mockRejectedValue(new Error('Mongo timeout')),
      findById: vi.fn(),
    };
    const auditRepository = makeAudit();

    const service = new ValidationsService({ enrichmentService, validationsRepository, auditRepository });

    await expect(service.create({ name: 'Juan', documentNumber: 'DOC12345' }))
      .rejects.toThrow('Mongo timeout');

    expect(auditRepository.putValidationCreated).not.toHaveBeenCalled();

    expect(auditRepository.putEvent).toHaveBeenCalledOnce();
    const call = auditRepository.putEvent.mock.calls[0][0];
    expect(call.documentNumber).toBe('DOC12345');
    expect(call.eventType).toBe('MONGO_WRITE_FAILED');
    expect(call.validationId).toBeNull();
    expect(call.errorMessage).toBe('Mongo timeout');
  });

  it('if DynamoDB fails, still returns the id (Mongo is source of truth)', async () => {
    const enrichmentService = makeEnrichmentOk();
    const validationsRepository = makeRepo();
    const auditRepository = {
      putValidationCreated: vi.fn().mockRejectedValue(new Error('DynamoDB down')),
      putEvent: vi.fn().mockResolvedValue(undefined),
    };

    const service = new ValidationsService({ enrichmentService, validationsRepository, auditRepository });
    const id = await service.create({ name: 'Juan', documentNumber: 'DOC12345' });

    expect(id).toBe('507f1f77bcf86cd799439011');
    expect(validationsRepository.create).toHaveBeenCalledOnce();
  });

  it('if failure audit event write also fails, still re-throws original error', async () => {
    const enrichmentService = { enrich: vi.fn().mockRejectedValue(new Error('API down')) };
    const validationsRepository = makeRepo();
    const auditRepository = {
      putValidationCreated: vi.fn(),
      putEvent: vi.fn().mockRejectedValue(new Error('DynamoDB also down')),
    };

    const service = new ValidationsService({ enrichmentService, validationsRepository, auditRepository });

    await expect(service.create({ name: 'Juan', documentNumber: 'DOC12345' }))
      .rejects.toThrow('API down');

    expect(auditRepository.putEvent).toHaveBeenCalledOnce();
    expect(validationsRepository.create).not.toHaveBeenCalled();
  });
});
