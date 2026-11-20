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

  async enrich(countryCode) {
    const code = countryCode ?? this.countryCode;
    const url = `${this.baseUrl}/countries/${code}`;
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
      const alpha3Code = body.alpha3Code;
      const region = body.region;
      const subregion = body.subregion;
      const capital = body.capital;
      const population = body.population;
      const languages = body.languages;
      const currency = body.currency;
      const flag = body.flag;
      const callingCode = body.callingCode;

      if (!country || !region || !capital || !currency) {
        throw new Error('Missing expected fields');
      }

      return { country, alpha3Code, region, subregion, capital, population, languages, currency, flag, callingCode, source: 'countries-api' };
    } catch (err) {
      logger.error({ err }, 'Unexpected response format from external API');
      throw new AppError(502, 'EXTERNAL_API_ERROR', 'External enrichment service returned an unexpected format');
    }
  }

  _wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
}
