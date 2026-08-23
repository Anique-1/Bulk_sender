const mongoose = require('mongoose');

const PromoCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  description: { type: String, default: '10% Extra Emails Promo for First 100 Users' },
  maxUses: { type: Number, default: 100 },
  usedCount: { type: Number, default: 0 },
  bonusPercent: { type: Number, default: 10 }, // 10% extra
  totalQuota: { type: Number, default: 2200 },  // 2,000 + 10% = 2,200 emails
  usedBy: [{ type: String, lowercase: true, trim: true }],
  isActive: { type: Boolean, default: true },
  expiresAt: { type: Date, default: null }
}, {
  timestamps: true
});

module.exports = mongoose.models.PromoCode || mongoose.model('PromoCode', PromoCodeSchema);
