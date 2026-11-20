import { describe, it, expect } from 'vitest';
import { createValidationSchema } from '../../src/schemas/validation.schema.js';

describe('createValidationSchema', () => {
  it('should accept a valid input', () => {
    const result = createValidationSchema.safeParse({
      name: 'Juan Pérez',
      documentNumber: 'ABC12345',
    });
    expect(result.success).toBe(true);
    expect(result.data.name).toBe('Juan Pérez');
    expect(result.data.documentNumber).toBe('ABC12345');
  });

  it('should trim whitespace from name and documentNumber', () => {
    const result = createValidationSchema.safeParse({
      name: '  María López  ',
      documentNumber: '  DOC12345  ',
    });
    expect(result.success).toBe(true);
    expect(result.data.name).toBe('María López');
    expect(result.data.documentNumber).toBe('DOC12345');
  });

  it('should reject when name is absent', () => {
    const result = createValidationSchema.safeParse({ documentNumber: 'ABC12345' });
    expect(result.success).toBe(false);
    const nameIssue = result.error.issues.find((i) => i.path.includes('name'));
    expect(nameIssue).toBeDefined();
  });

  it('should reject when name is too short (< 2 chars)', () => {
    const result = createValidationSchema.safeParse({
      name: 'A',
      documentNumber: 'ABC12345',
    });
    expect(result.success).toBe(false);
  });

  it('should reject name with invalid symbols', () => {
    const result = createValidationSchema.safeParse({
      name: 'Juan@Pérez!',
      documentNumber: 'ABC12345',
    });
    expect(result.success).toBe(false);
  });

  it('should accept name with accents, ñ, apostrophe, period, and hyphen', () => {
    const result = createValidationSchema.safeParse({
      name: "María-José O'Brien Ñoño Sr.",
      documentNumber: 'ABC12345',
    });
    expect(result.success).toBe(true);
  });

  it('should reject when documentNumber is empty', () => {
    const result = createValidationSchema.safeParse({
      name: 'Juan Pérez',
      documentNumber: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject documentNumber with spaces', () => {
    const result = createValidationSchema.safeParse({
      name: 'Juan Pérez',
      documentNumber: 'ABC 12345',
    });
    expect(result.success).toBe(false);
  });

  it('should reject documentNumber with symbols', () => {
    const result = createValidationSchema.safeParse({
      name: 'Juan Pérez',
      documentNumber: 'ABC-12345',
    });
    expect(result.success).toBe(false);
  });

  it('should reject extra/unknown fields (strict mode)', () => {
    const result = createValidationSchema.safeParse({
      name: 'Juan Pérez',
      documentNumber: 'ABC12345',
      extraField: 'not allowed',
    });
    expect(result.success).toBe(false);
  });
});
