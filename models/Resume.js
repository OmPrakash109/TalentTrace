import mongoose from 'mongoose';

// Schema representing a parsed resume and its scoring metadata.
// Keep fields flexible; downstream processes may enrich with structured experience/education later.

const ResumeSchema = new mongoose.Schema(
  {
    candidateName: { type: String, required: false },
    email: { type: String, required: false, index: true },
    phone: { type: String, required: false },
    skills: { type: [String], required: false, default: [] },
    experience: { type: String, required: false },
    education: { type: String, required: false },
    pdfText: { type: String, required: false },
    fileName: { type: String, required: true },
    roleApplied: { type: String, required: false }, // Role extracted from job description
    matchScore: { type: Number, required: false, min: 0, max: 100 },
    justification: { type: String, required: false },
    uploadDate: { type: Date, required: true, default: Date.now }
  },
  { timestamps: true }
);

export default mongoose.model('Resume', ResumeSchema);


