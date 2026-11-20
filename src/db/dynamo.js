import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  ResourceInUseException,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import pino from 'pino';

const logger = pino({ name: 'dynamo' });

export function createDynamoClients({ endpoint, region, accessKeyId, secretAccessKey }) {
  const rawClient = new DynamoDBClient({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
  const docClient = DynamoDBDocumentClient.from(rawClient);
  return { rawClient, docClient };
}

export async function ensureAuditTable(rawClient, tableName) {
  try {
    await rawClient.send(
      new CreateTableCommand({
        TableName: tableName,
        KeySchema: [
          { AttributeName: 'documentNumber', KeyType: 'HASH' },
          { AttributeName: 'eventKey', KeyType: 'RANGE' },
        ],
        AttributeDefinitions: [
          { AttributeName: 'documentNumber', AttributeType: 'S' },
          { AttributeName: 'eventKey', AttributeType: 'S' },
        ],
        BillingMode: 'PAY_PER_REQUEST',
      }),
    );
    logger.info({ tableName }, 'Audit table created');
  } catch (err) {
    if (err instanceof ResourceInUseException || err.name === 'ResourceInUseException') {
      logger.info({ tableName }, 'Audit table already exists');
    } else {
      throw err;
    }
  }

  let status = '';
  while (status !== 'ACTIVE') {
    const desc = await rawClient.send(
      new DescribeTableCommand({ TableName: tableName }),
    );
    status = desc.Table?.TableStatus ?? '';
    if (status !== 'ACTIVE') {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  logger.info({ tableName }, 'Audit table is ACTIVE');
}
