import { ValidationModel } from '../models/validation.model.js';

export class ValidationsRepository {
  async create(data) {
    const doc = await ValidationModel.create(data);
    return doc;
  }

  async findById(id) {
    const doc = await ValidationModel.findById(id).lean();
    return doc;
  }
}
