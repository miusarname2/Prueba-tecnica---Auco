import { describe, it, expect } from 'vitest';
import { AuditRepository } from '../../src/repositories/audit.repository.js';

describe('AuditRepository.buildEventKey', () => {
  it('builds eventKey as <ISO>#<validationId>', () => {
    const iso = '2024-01-15T10:00:00.000Z';
    const validationId = '507f1f77bcf86cd799439011';
    const key = AuditRepository.buildEventKey(iso, validationId);

    expect(key).toBe('2024-01-15T10:00:00.000Z#507f1f77bcf86cd799439011');
  });

  it('contains exactly one # separator', () => {
    const key = AuditRepository.buildEventKey('2024-06-01T00:00:00.000Z', 'abc123');
    const parts = key.split('#');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe('2024-06-01T00:00:00.000Z');
    expect(parts[1]).toBe('abc123');
  });
});
