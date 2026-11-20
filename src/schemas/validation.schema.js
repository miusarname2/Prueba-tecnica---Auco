import { z } from 'zod';

const NAME_REGEX = /^[a-zA-ZÀ-ÖØ-öø-ÿÑñ\s'.\-]+$/;

const DOCUMENT_REGEX = /^[a-zA-Z0-9]+$/;

export const createValidationSchema = z.object({
  name: z
    .string({ required_error: 'name is required' })
    .trim()
    .min(2, 'name must be at least 2 characters')
    .max(100, 'name must be at most 100 characters')
    .regex(NAME_REGEX, 'name contains invalid characters'),
  documentNumber: z
    .string({ required_error: 'documentNumber is required' })
    .trim()
    .min(5, 'documentNumber must be at least 5 characters')
    .max(20, 'documentNumber must be at most 20 characters')
    .regex(DOCUMENT_REGEX, 'documentNumber must contain only letters and digits'),
}).strict();
