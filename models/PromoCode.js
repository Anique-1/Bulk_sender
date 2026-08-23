const mongoose = require('mongoose');

const PromoCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  description: { type: String, default: '10% OFF Checkout Promo ($2.69 for 2,000 Emails) for First 100 Users' },
  maxUses: { type: Number, default: 100 },
  usedCount: { type: Number, default: 0 },
  discountPercent: { type: Number, default: 10 }, // 10% discount at checkout
  discountedPrice: { type: Number, default: 2.69 }, // $2.69 instead of $2.99
  totalQuota: { type: Number, default: 2000 },  // 2,000 emails package
  usedBy: [{ type: String, lowercase: true, trim: true }],
  isActive: { type: Boolean, default: true },
  expiresAt: { type: Date, default: null }
}, {
  timestamps: true
});

module.exports = mongoose.models.PromoCode || mongoose.model('PromoCode', PromoCodeSchema);
