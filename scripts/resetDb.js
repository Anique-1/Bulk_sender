require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const ACCOUNTS_FILE = path.join(__dirname, '../data/accounts.json');

async function resetDatabase() {
  console.log('🔄 Starting Database Reset for ReplyEO Bulk Gmail Sender...');

  // 1. Reset local accounts.json
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
      const raw = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
      const accounts = JSON.parse(raw);
      const resetAccounts = accounts.map(a => ({
        ...a,
        subscription: {
          plan: 'free',
          status: 'trial',
          accountLimit: 1
        },
        usage: {
          dailySentCount: 0,
          lastSentDate: new Date().toISOString().split('T')[0],
          dailyLimit: 5,
          totalSentAllTime: 0
        }
      }));
      fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(resetAccounts, null, 2), 'utf8');
      console.log('✅ Local accounts.json reset to Free Trial (5 emails/day, 0 sent).');
    }
  } catch (err) {
    console.error('Error resetting accounts.json:', err.message);
  }

  // 2. Reset MongoDB Collections
  if (process.env.MONGODB_URI) {
    try {
      console.log('Connecting to MongoDB Atlas...');
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('Connected to MongoDB.');

      // Update accounts in DB to Free tier with 0 sent
      const Account = require('../models/Account');
      const Campaign = require('../models/Campaign');
      const Attachment = require('../models/Attachment');
      const LicenseKey = require('../models/LicenseKey');

      await Account.updateMany({}, {
        $set: {
          'subscription.plan': 'free',
          'subscription.status': 'trial',
          'subscription.accountLimit': 1,
          'subscription.lemonSqueezyCustomerId': null,
          'subscription.lemonSqueezySubscriptionId': null,
          'subscription.licenseKey': null,
          'usage.dailySentCount': 0,
          'usage.lastSentDate': new Date().toISOString().split('T')[0],
          'usage.dailyLimit': 5,
          'usage.totalSentAllTime': 0
        }
      });
      console.log('✅ MongoDB Accounts reset to Free Trial.');

      // Clear campaigns and attachments test data
      const campaignsCount = await Campaign.deleteMany({});
      const attachmentsCount = await Attachment.deleteMany({});
      const licenseKeysCount = await LicenseKey.deleteMany({});

      console.log(`✅ Cleared ${campaignsCount.deletedCount} test campaigns.`);
      console.log(`✅ Cleared ${attachmentsCount.deletedCount} attachments.`);
      console.log(`✅ Cleared ${licenseKeysCount.deletedCount} license keys.`);

      await mongoose.disconnect();
      console.log('🟢 MongoDB reset completed successfully!');
    } catch (err) {
      console.error('MongoDB reset error:', err.message);
    }
  }

  console.log('===========================================================');
  console.log('🎉 Database is 100% clean and ready for Lemon Squeezy test!');
  console.log('===========================================================');
  process.exit(0);
}

resetDatabase();
