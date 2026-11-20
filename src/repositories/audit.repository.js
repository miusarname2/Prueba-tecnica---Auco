import { PutCommand } from '@aws-sdk/lib-dynamodb';
import pino from 'pino';

const logger = pino({ name: 'audit-repository' });

export class AuditRepository {
  constructor(docClient, tableName) {
    this.docClient = docClient;
    this.tableName = tableName;
  }

  static buildEventKey(isoTimestamp, validationId) {
    return `${isoTimestamp}#${validationId}`;
  }

  async putValidationCreated({ documentNumber, validationId, createdAt }) {
    const eventKey = AuditRepository.buildEventKey(createdAt, validationId);

    const item = {
      documentNumber,
      eventKey,
      eventType: 'VALIDATION_CREATED',
      validationId,
      createdAt,
    };

    try {
      await this.docClient.send(
        new PutCommand({ TableName: this.tableName, Item: item }),
      );
    } catch (err) {
      logger.error({ err, validationId }, 'Failed to write audit event to DynamoDB');
      throw err;
    }
  }
}
