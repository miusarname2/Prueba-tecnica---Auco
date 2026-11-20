import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { createValidationSchema } from '../schemas/validation.schema.js';
import { makeValidationsController } from '../controllers/validations.controller.js';

export function validationsRouter(validationsService) {
  const router = Router();
  const controller = makeValidationsController(validationsService);

  router.post('/', validate(createValidationSchema), controller.create);
  router.get('/:id', controller.findById);

  return router;
}
