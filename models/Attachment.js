const mongoose = require('mongoose');

const AttachmentSchema = new mongoose.Schema({
  publicId: { type: String, required: true },
  url: { type: String, required: true },
  secureUrl: { type: String, required: true },
  filename: { type: String, required: true },
  format: { type: String }, // 'pdf', 'png', 'jpg', etc.
  resourceType: { type: String, default: 'image' }, // 'image' | 'raw'
  bytes: { type: Number },
  uploaderEmail: { type: String, default: 'anonymous' },
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

module.exports = mongoose.models.Attachment || mongoose.model('Attachment', AttachmentSchema);
