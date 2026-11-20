import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnrichmentService } from '../../src/services/enrichment.service.js';

const VALID_RESPONSE = {
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

function createService(fetchFn) {
  return new EnrichmentService({
    baseUrl: 'https://api.example.com',
    countryCode: 'CO',
    timeoutMs: 1000,
    retries: 1,
    fetchFn,
  });
}

describe('EnrichmentService', () => {
  it('should map a valid response correctly', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => VALID_RESPONSE,
    });

    const service = createService(fetchFn);
    const result = await service.enrich();

    expect(result).toEqual({
      country: 'Colombia',
      officialName: 'Colombia',
      region: 'Americas',
      capital: 'Bogotá',
      currencyCode: 'COP',
      currencyName: 'COP',
      source: 'countries-api',
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('should retry on 500 and throw EXTERNAL_API_ERROR after exhausting retries', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ status: 500 });

    const service = createService(fetchFn);

    await expect(service.enrich()).rejects.toMatchObject({
      status: 502,
      code: 'EXTERNAL_API_ERROR',
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('should throw EXTERNAL_API_TIMEOUT on timeout after retries', async () => {
    const fetchFn = vi.fn().mockImplementation((_url, opts) => {
      return new Promise((_resolve, reject) => {
        const onAbort = () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        };
        if (opts?.signal?.aborted) {
          onAbort();
        } else {
          opts?.signal?.addEventListener('abort', onAbort);
        }
      });
    });

    const service = new EnrichmentService({
      baseUrl: 'https://api.example.com',
      countryCode: 'CO',
      timeoutMs: 50,
      retries: 1,
      fetchFn,
    });

    await expect(service.enrich()).rejects.toMatchObject({
      status: 504,
      code: 'EXTERNAL_API_TIMEOUT',
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('should NOT retry on 404 (4xx)', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ status: 404 });

    const service = createService(fetchFn);

    await expect(service.enrich()).rejects.toMatchObject({
      status: 502,
      code: 'EXTERNAL_API_ERROR',
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('should throw EXTERNAL_API_ERROR for unexpected body format', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ unexpected: true }),
    });

    const service = createService(fetchFn);

    await expect(service.enrich()).rejects.toMatchObject({
      status: 502,
      code: 'EXTERNAL_API_ERROR',
    });
  });
});
