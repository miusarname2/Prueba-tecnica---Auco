import mongoose from 'mongoose';

const enrichmentSchema = new mongoose.Schema(
  {
    country: { type: String, required: true },
    alpha3Code: { type: String },
    region: { type: String, required: true },
    subregion: { type: String },
    capital: { type: String, required: true },
    population: { type: Number },
    languages: [{ type: String }],
    currency: { type: String, required: true },
    flag: { type: String },
    callingCode: { type: String },
    source: { type: String, required: true, default: 'countries-api' },
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
