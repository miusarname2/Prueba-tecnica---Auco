import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { hashDocument } from '../utils/crypto.js';

const logger = pino({ name: 'audit-repository' });

export class AuditRepository {
  constructor(docClient, tableName) {
    this.docClient = docClient;
    this.tableName = tableName;
  }

  static buildEventKey(isoTimestamp, validationId) {
    return `${isoTimestamp}#${validationId}`;
  }

  async putEvent({ documentNumber, eventType, validationId, createdAt, errorCode, errorMessage }) {
    const effectiveId = validationId ?? randomUUID();
    const eventKey = AuditRepository.buildEventKey(createdAt, effectiveId);
    const hashedDoc = hashDocument(documentNumber);

    const item = {
      documentNumber: hashedDoc,
      eventKey,
      eventType,
      validationId: effectiveId,
      createdAt,
    };

    if (errorCode) item.errorCode = errorCode;
    if (errorMessage) item.errorMessage = errorMessage;

    try {
      await this.docClient.send(
        new PutCommand({ TableName: this.tableName, Item: item }),
      );
    } catch (err) {
      logger.error({ err, eventType, validationId: effectiveId }, 'Failed to write audit event to DynamoDB');
      throw err;
    }
  }

  async putValidationCreated({ documentNumber, validationId, createdAt }) {
    return this.putEvent({
      documentNumber,
      eventType: 'VALIDATION_CREATED',
      validationId,
      createdAt,
    });
  }
}
