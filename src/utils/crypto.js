import { createHash } from 'node:crypto';

export function hashDocument(value) {
  return createHash('sha256').update(value).digest('hex');
}
