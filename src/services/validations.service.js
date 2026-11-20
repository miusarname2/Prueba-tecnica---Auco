import pino from 'pino';

const logger = pino({ name: 'validations-service' });

export class ValidationsService {
  constructor({ enrichmentService, validationsRepository, auditRepository }) {
    this.enrichmentService = enrichmentService;
    this.validationsRepository = validationsRepository;
    this.auditRepository = auditRepository;
  }

  async create({ name, documentNumber }) {
    const enrichment = await this.enrichmentService.enrich();

    const doc = await this.validationsRepository.create({
      name,
      documentNumber,
      enrichment,
    });

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
