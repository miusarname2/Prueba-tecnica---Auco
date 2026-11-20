import mongoose from 'mongoose';
import pino from 'pino';

const logger = pino({ name: 'mongo' });

export async function connectMongo(uri) {
  await mongoose.connect(uri);
  logger.info('Connected to MongoDB');

  const shutdown = async () => {
    logger.info('Closing MongoDB connection…');
    await mongoose.connection.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
