import { AppError } from '../errors/app-error.js';

export function validate(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || '_root',
        message: issue.message,
      }));
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid request body', details);
    }
    req.body = result.data;
    next();
  };
}
