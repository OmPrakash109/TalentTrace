import mongoose from 'mongoose';

const ResumeSchema = new mongoose.Schema(
  {
    originalFilename: { type: String, required: true },
    storedFilename: { type: String, required: true },
    textContent: { type: String, required: false },
    parsedAt: { type: Date, required: false },
    analysis: { type: Object, required: false },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true }
  },
  { timestamps: true }
);

export default mongoose.model('Resume', ResumeSchema);


