import { AppError } from '../errors/app-error.js';
import pino from 'pino';

const logger = pino({ name: 'enrichment-service' });

export class EnrichmentService {
  /**
   * @param {object} opts
   * @param {string} opts.baseUrl      - e.g. https://countries-api.davegarvey.workers.dev
   * @param {string} opts.countryCode  - e.g. CO
   * @param {number} opts.timeoutMs    - abort after this many ms
   * @param {number} opts.retries      - additional retry attempts
   * @param {Function} [opts.fetchFn]  - injectable fetch (defaults to global fetch)
   */
  constructor({ baseUrl, countryCode, timeoutMs, retries, fetchFn }) {
    this.baseUrl = baseUrl;
    this.countryCode = countryCode;
    this.timeoutMs = timeoutMs;
    this.retries = retries;
    this.fetchFn = fetchFn ?? globalThis.fetch;
  }

  async enrich() {
    const url = `${this.baseUrl}/countries/${this.countryCode}`;
    const maxAttempts = 1 + this.retries;

    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const res = await this.fetchFn(url, { signal: controller.signal });
        clearTimeout(timer);

        if (res.status >= 400 && res.status < 500) {
          logger.warn({ status: res.status, attempt }, 'External API returned 4xx');
          throw new AppError(502, 'EXTERNAL_API_ERROR', 'External enrichment service returned an error');
        }

        if (res.status >= 500) {
          logger.warn({ status: res.status, attempt }, 'External API returned 5xx');
          lastError = new AppError(502, 'EXTERNAL_API_ERROR', 'External enrichment service returned an error');
          if (attempt < maxAttempts) {
            await this._wait(300);
            continue;
          }
          throw lastError;
        }

        const body = await res.json();
        return this._mapResponse(body);
      } catch (err) {
        clearTimeout(timer);

        if (err instanceof AppError) throw err;

        if (err.name === 'AbortError') {
          logger.warn({ attempt }, 'External API request timed out');
          lastError = new AppError(504, 'EXTERNAL_API_TIMEOUT', 'External enrichment service timed out');
          if (attempt < maxAttempts) {
            await this._wait(300);
            continue;
          }
          throw lastError;
        }

        logger.warn({ err: err.message, attempt }, 'External API network error');
        lastError = new AppError(502, 'EXTERNAL_API_ERROR', 'External enrichment service is unavailable');
        if (attempt < maxAttempts) {
          await this._wait(300);
          continue;
        }
        throw lastError;
      }
    }

    throw lastError;
  }

  _mapResponse(body) {
    try {
      const country = body.name;
      const officialName = body.name; 
      const region = body.region;
      const capital = body.capital;
      const currencyCode = body.currency;
      const currencyName = body.currency;

      if (!country || !region || !capital || !currencyCode) {
        throw new Error('Missing expected fields');
      }

      return { country, officialName, region, capital, currencyCode, currencyName, source: 'countries-api' };
    } catch (err) {
      logger.error({ err }, 'Unexpected response format from external API');
      throw new AppError(502, 'EXTERNAL_API_ERROR', 'External enrichment service returned an unexpected format');
    }
  }

  _wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
}
