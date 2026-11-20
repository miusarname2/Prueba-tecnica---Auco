import mongoose from 'mongoose';

const enrichmentSchema = new mongoose.Schema(
  {
    country: { type: String, required: true },
    officialName: { type: String, required: true },
    region: { type: String, required: true },
    capital: { type: String, required: true },
    currencyCode: { type: String, required: true },
    currencyName: { type: String, required: true },
    source: { type: String, required: true, default: 'restcountries' },
  },
  { _id: false },
);

const validationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    documentNumber: { type: String, required: true, index: true },
    enrichment: { type: enrichmentSchema, required: true },
  },
  { timestamps: true },
);

export const ValidationModel = mongoose.model('Validation', validationSchema);
