import pino from 'pino';

const logger = pino({ name: 'validations-service' });

export class ValidationsService {
  constructor({ enrichmentService, validationsRepository, auditRepository }) {
    this.enrichmentService = enrichmentService;
    this.validationsRepository = validationsRepository;
    this.auditRepository = auditRepository;
  }

  async create({ name, documentNumber, countryCode }) {
    let enrichment;
    try {
      enrichment = await this.enrichmentService.enrich(countryCode);
    } catch (err) {
      try {
        await this.auditRepository.putEvent({
          documentNumber,
          eventType: 'ENRICHMENT_FAILED',
          validationId: null,
          createdAt: new Date().toISOString(),
          errorCode: err.code ?? err.name ?? 'UNKNOWN',
          errorMessage: err.message,
        });
      } catch (auditErr) {
        logger.error({ err: auditErr }, 'Failed to write ENRICHMENT_FAILED audit event');
      }
      throw err;
    }

    let doc;
    try {
      doc = await this.validationsRepository.create({
        name,
        documentNumber,
        enrichment,
      });
    } catch (err) {
      try {
        await this.auditRepository.putEvent({
          documentNumber,
          eventType: 'MONGO_WRITE_FAILED',
          validationId: null,
          createdAt: new Date().toISOString(),
          errorCode: err.code?.toString() ?? err.name ?? 'UNKNOWN',
          errorMessage: err.message,
        });
      } catch (auditErr) {
        logger.error({ err: auditErr }, 'Failed to write MONGO_WRITE_FAILED audit event');
      }
      throw err;
    }

    const validationId = doc._id.toString();
    const createdAt = doc.createdAt.toISOString();

    try {
      await this.auditRepository.putValidationCreated({
        documentNumber,
        validationId,
        createdAt,
      });
    } catch (err) {
      logger.error({ err, validationId }, 'Audit write failed; Mongo record preserved');
    }

    return validationId;
  }

  async findById(id) {
    const doc = await this.validationsRepository.findById(id);
    if (!doc) return null;

    const { _id, __v, ...rest } = doc;
    return { id: _id.toString(), ...rest };
  }
}
