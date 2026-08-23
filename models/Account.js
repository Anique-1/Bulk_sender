const mongoose = require('mongoose');

const AccountSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, default: '' },
  picture: { type: String, default: '' },
  profileId: { type: String, default: null },
  isConnected: { type: Boolean, default: true },
  type: { type: String, enum: ['oauth', 'smtp'], default: 'oauth' },
  
  // OAuth Tokens
  tokens: {
    access_token: { type: String },
    refresh_token: { type: String },
    expiry_date: { type: Number },
    token_type: { type: String },
    scope: { type: String }
  },

  // SMTP Settings (for manual accounts)
  smtp: {
    host: { type: String },
    port: { type: Number },
    secure: { type: Boolean },
    user: { type: String },
    pass: { type: String }
  },

  // Subscription & $2.99 Plan Details
  subscription: {
    plan: { type: String, enum: ['free', 'starter_2_99', 'starter_1_99', 'pro', 'lifetime'], default: 'free' },
    status: { type: String, enum: ['active', 'inactive', 'trial', 'cancelled', 'expired'], default: 'trial' },
    accountLimit: { type: Number, default: 1 }, // 1 Gmail account per $2.99 license
    lemonSqueezyCustomerId: { type: String, default: null },
    lemonSqueezySubscriptionId: { type: String, default: null },
    licenseKey: { type: String, default: null },
    currentPeriodEnd: { type: Date, default: null },
    trialEndsAt: { 
      type: Date, 
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days free trial
    }
  },

  // Usage Quota & Stats
  usage: {
    dailySentCount: { type: Number, default: 0 },
    lastSentDate: { type: String, default: () => new Date().toISOString().split('T')[0] },
    dailyLimit: { type: Number, default: 25 }, // Free Trial: 25, Starter Pro: 2000
    totalSentAllTime: { type: Number, default: 0 },
    proSentCount: { type: Number, default: 0 }, // Emails sent under current 2,000 Pro package
    proLimit: { type: Number, default: 2000 }    // Pro quota limit: 2,000 emails per upgrade
  },

  connectedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

module.exports = mongoose.models.Account || mongoose.model('Account', AccountSchema);
