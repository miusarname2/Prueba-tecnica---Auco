import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import pino from 'pino';
import { validationsRouter } from './routes/validations.routes.js';
import { errorHandler } from './middlewares/error-handler.js';
import { AppError } from './errors/app-error.js';

export function createApp({ validationsService }) {
  const app = express();

  app.use(helmet());
  app.use(pinoHttp({
    logger: pino({
      level: 'info',
      redact: {
        paths: ['req.body.documentNumber', 'responseBody.documentNumber'],
        censor: '[REDACTED]',
      },
    }),
  }));
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/validations', validationsRouter(validationsService));
  app.use((_req, _res, next) => {
    next(new AppError(404, 'NOT_FOUND', 'Route not found'));
  });

  app.use(errorHandler);

  return app;
}
