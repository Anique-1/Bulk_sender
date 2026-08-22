const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Account = require('../models/Account');
const LicenseKey = require('../models/LicenseKey');
const { getIsConnected } = require('../config/db');
const { getAccount, saveAccount, getDailyUsage } = require('../services/tokenService');

const DEFAULT_CHECKOUT_URL = process.env.LEMONSQUEEZY_CHECKOUT_URL || 'https://replyeo.lemonsqueezy.com/checkout/buy/f0ec5261-ef37-41a3-89ad-7acabe2d99ce';

/**
 * GET /api/subscription/plans
 * Returns pricing tiers, features, and direct checkout URL
 */
router.get('/plans', (req, res) => {
  res.json({
    success: true,
    plans: [
      {
        id: 'free',
        name: 'Free Trial',
        price: 0,
        currency: 'USD',
        billing: 'Free Forever',
        accountLimit: 1,
        dailyLimit: 5,
        features: [
          'Connect 1 Gmail Account',
          '5 emails per day',
          'Basic Dynamic Tags ({{name}}, {{email}})',
          'Upgrade to Pro for PDF attachments & 2,000/day'
        ]
      },
      {
        id: 'starter_1_99',
        name: 'Starter Pro (1 Account)',
        price: 1.99,
        currency: 'USD',
        billing: 'Monthly ($1.99/mo)',
        accountLimit: 1,
        dailyLimit: 2000,
        badge: 'POPULAR',
        checkoutUrl: DEFAULT_CHECKOUT_URL,
        features: [
          '✅ 1 Connected Gmail / Workspace Account',
          '✅ Full 500 – 2,000 Emails / Day Quota',
          '✅ Cloudinary PDF & Image Attachments',
          '✅ Smart Anti-Spam Interval Throttling',
          '✅ CSV Mail Merge & Live SSE Dispatch',
          '✅ Real-time Open & Delivery Logging'
        ]
      },
      {
        id: 'pro_multi',
        name: 'Agency Multi-Account',
        price: 7.99,
        currency: 'USD',
        billing: 'Monthly ($7.99/mo)',
        accountLimit: 5,
        dailyLimit: 10000,
        features: [
          '✅ Up to 5 Business Gmail Accounts',
          '✅ Account Rotation & Load Balancing',
          '✅ Unlimited Cloudinary PDF Catalogs',
          '✅ Priority Email Sending Queue'
        ]
      }
    ]
  });
});

/**
 * GET /api/subscription/status/:email
 * Checks subscription status and daily quota for an account
 */
router.get('/status/:email', async (req, res) => {
  const cleanEmail = req.params.email.toLowerCase().trim();
  const profileId = req.headers['x-profile-id'] || null;
  const usage = await getDailyUsage(cleanEmail, profileId);

  res.json({
    success: true,
    email: cleanEmail,
    plan: usage.plan,
    status: usage.status,
    isPro: usage.isPro,
    sentToday: usage.sentToday,
    limit: usage.limit,
    remaining: usage.remaining,
    accountLimit: 1,
    expiryDate: usage.expiryDate,
    checkoutUrl: `${DEFAULT_CHECKOUT_URL}?checkout[email]=${encodeURIComponent(cleanEmail)}`
  });
});

/**
 * POST /api/subscription/activate-license
 * Activates a $1.99 license key or promo code for an account
 */
router.post('/activate-license', async (req, res) => {
  const { email, licenseKey } = req.body;

  if (!email || !licenseKey) {
    return res.status(400).json({ success: false, error: 'Email and licenseKey are required' });
  }

  const cleanEmail = email.toLowerCase().trim();
  const cleanKey = licenseKey.toUpperCase().trim();

  if (getIsConnected()) {
    try {
      const keyDoc = await LicenseKey.findOne({ key: cleanKey });
      if (!keyDoc) {
        return res.status(404).json({ success: false, error: 'Invalid license key. Please check and try again.' });
      }
      if (keyDoc.isUsed && keyDoc.usedByEmail !== cleanEmail) {
        return res.status(400).json({ success: false, error: 'This license key has already been used by another account.' });
      }

      keyDoc.isUsed = true;
      keyDoc.usedByEmail = cleanEmail;
      keyDoc.activatedAt = new Date();
      await keyDoc.save();

      // Update Account in DB
      let account = await Account.findOne({ email: cleanEmail });
      if (!account) {
        account = new Account({
          id: 'acc_' + Date.now(),
          email: cleanEmail,
          name: cleanEmail.split('@')[0]
        });
      }

      account.subscription.plan = 'starter_1_99';
      account.subscription.status = 'active';
      account.subscription.licenseKey = cleanKey;
      account.subscription.accountLimit = 1;
      await account.save();

      return res.json({
        success: true,
        message: '🎉 $1.99 Starter Plan activated successfully!',
        plan: account.subscription.plan,
        status: account.subscription.status,
        accountLimit: account.subscription.accountLimit
      });
    } catch (err) {
      console.error('[Subscription] License activation error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // Local JSON fallback
  res.json({
    success: true,
    message: '🎉 License activated (Local Mode)!',
    plan: 'starter_1_99',
    status: 'active',
    accountLimit: 1
  });
});

/**
 * POST /api/subscription/simulate-upgrade
 * Quick helper for testing / developer verification
 */
router.post('/simulate-upgrade', async (req, res) => {
  const { email, plan = 'starter_1_99' } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, error: 'Email is required' });
  }

  const cleanEmail = email.toLowerCase().trim();

  if (getIsConnected()) {
    try {
      const account = await Account.findOneAndUpdate(
        { email: cleanEmail },
        {
          $set: {
            'subscription.plan': plan,
            'subscription.status': 'active',
            'subscription.accountLimit': plan === 'pro_multi' ? 5 : 1
          }
        },
        { new: true, upsert: true }
      );
      return res.json({ success: true, message: `Account upgraded to ${plan}`, account });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  res.json({ success: true, message: `Simulated upgrade to ${plan} (Local Mode)` });
});

/**
 * POST /api/subscription/webhook
 * Webhook endpoint for Lemon Squeezy / Payment Providers
 */
router.post('/webhook', async (req, res) => {
  try {
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    const signature = req.headers['x-signature'];

    // Verify HMAC signature if secret & signature provided
    if (secret && signature) {
      try {
        const rawBody = req.rawBody || Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
        const hmac = crypto.createHmac('sha256', secret);
        const digest = Buffer.from(hmac.update(rawBody).digest('hex'), 'utf8');
        const signatureBuffer = Buffer.from(signature, 'utf8');

        if (digest.length === signatureBuffer.length && crypto.timingSafeEqual(digest, signatureBuffer)) {
          console.log('[Webhook] 🔐 HMAC signature verified successfully.');
        } else {
          console.warn('[Webhook] ⚠️ Signature mismatch, proceeding with payload processing in test mode.');
        }
      } catch (sigErr) {
        console.warn('[Webhook] Signature check notice:', sigErr.message);
      }
    }

    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const eventName = payload.meta && payload.meta.event_name ? payload.meta.event_name : 'unknown';
    const attributes = (payload.data && payload.data.attributes) || {};

    const customerEmail = (
      attributes.user_email ||
      attributes.customer_email ||
      (payload.meta && payload.meta.custom_data && payload.meta.custom_data.email) ||
      (attributes.first_subscription_item && attributes.first_subscription_item.user_email)
    )?.toLowerCase().trim();

    console.log(`[Webhook] 📥 Received Lemon Squeezy event: "${eventName}" for email: "${customerEmail}"`);

    if (customerEmail) {
      const isActivationEvent = (
        eventName === 'subscription_created' ||
        eventName === 'subscription_payment_success' ||
        eventName === 'subscription_updated' ||
        eventName === 'order_created'
      );

      if (isActivationEvent) {
        // 1. Sync in MongoDB
        if (getIsConnected()) {
          await Account.findOneAndUpdate(
            { email: customerEmail },
            {
              $set: {
                'subscription.plan': 'starter_1_99',
                'subscription.status': 'active',
                'subscription.accountLimit': 1,
                'subscription.lemonSqueezyCustomerId': attributes.customer_id ? String(attributes.customer_id) : null,
                'subscription.lemonSqueezySubscriptionId': payload.data.id ? String(payload.data.id) : null,
                'usage.dailyLimit': 2000
              }
            },
            { upsert: true, new: true }
          );
        }

        // 2. Sync in Local JSON
        const fs = require('fs');
        const path = require('path');
        const DATA_DIR = process.env.VERCEL ? path.join('/tmp', 'data') : path.join(__dirname, '../data');
        const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
        if (fs.existsSync(ACCOUNTS_FILE)) {
          try {
            const raw = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
            const accounts = JSON.parse(raw);
            const acc = accounts.find(a => a.email.toLowerCase() === customerEmail);
            if (acc) {
              acc.subscription = { plan: 'starter_1_99', status: 'active', accountLimit: 1 };
              if (!acc.usage) acc.usage = { dailySentCount: 0, lastSentDate: new Date().toISOString().split('T')[0], dailyLimit: 2000, totalSentAllTime: 0 };
              acc.usage.dailyLimit = 2000;
              fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf8');
            }
          } catch (e) {}
        }

        console.log(`[Webhook] 🟢 Successfully upgraded ${customerEmail} to Starter Pro ($1.99/mo)!`);
      } else if (eventName === 'subscription_cancelled' || eventName === 'subscription_expired') {
        if (getIsConnected()) {
          await Account.findOneAndUpdate(
            { email: customerEmail },
            { $set: { 'subscription.status': 'expired' } }
          );
        }
        console.log(`[Webhook] ⚠️ Subscription cancelled for ${customerEmail}`);
      }
    }

    res.json({ success: true, received: true, event: eventName, email: customerEmail });
  } catch (err) {
    console.error('[Webhook] Error processing webhook:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
