import mongoose from 'mongoose';
import { AppError } from '../errors/app-error.js';

export function makeValidationsController(validationsService) {
  return {
    async create(req, res, next) {
      try {
        const { name, documentNumber } = req.body;
        const id = await validationsService.create({ name, documentNumber });
        res.status(201).json({ id });
      } catch (err) {
        next(err);
      }
    },

    async findById(req, res, next) {
      try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
          throw new AppError(400, 'INVALID_ID', 'The provided id is not a valid identifier');
        }

        const record = await validationsService.findById(id);
        if (!record) {
          throw new AppError(404, 'NOT_FOUND', 'Validation not found');
        }

        res.json(record);
      } catch (err) {
        next(err);
      }
    },
  };
}
