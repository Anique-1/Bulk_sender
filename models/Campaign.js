const mongoose = require('mongoose');

const CampaignLogSchema = new mongoose.Schema({
  index: { type: Number },
  email: { type: String, required: true },
  name: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now },
  status: { type: String, enum: ['success', 'failed', 'pending'], default: 'pending' },
  error: { type: String, default: null }
}, { _id: false });

const CampaignSchema = new mongoose.Schema({
  jobId: { type: String, required: true, unique: true },
  senderEmail: { type: String, required: true, lowercase: true },
  subjectTemplate: { type: String, required: true },
  bodyTemplate: { type: String, required: true },
  attachments: [{
    url: { type: String },
    filename: { type: String },
    resourceType: { type: String, default: 'image' }, // 'image' | 'raw' | 'pdf'
    size: { type: Number }
  }],
  totalRecipients: { type: Number, required: true },
  sentCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['pending', 'running', 'paused', 'stopped', 'completed'],
    default: 'pending'
  },
  delayMin: { type: Number, default: 3 },
  delayMax: { type: Number, default: 7 },
  logs: [CampaignLogSchema],
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date }
}, {
  timestamps: true
});

module.exports = mongoose.models.Campaign || mongoose.model('Campaign', CampaignSchema);
