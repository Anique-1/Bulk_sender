const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Account = require('../models/Account');
const LicenseKey = require('../models/LicenseKey');
const PromoCode = require('../models/PromoCode');
const { getIsConnected } = require('../config/db');
const { getDailyUsage } = require('../services/tokenService');
const DEFAULT_CHECKOUT_URL = process.env.GUMROAD_CHECKOUT_URL || 'https://muhammadanique.gumroad.com/l/wlgzrc?wanted=true';

// In-memory fallback for promo code tracking
let localPromoState = {
  FIRST100: {
    code: 'FIRST100',
    maxUses: 100,
    usedBy: new Set(),
    discountPercent: 10,
    discountedPrice: 2.69,
    totalQuota: 2000
  }
};

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
        billing: '25 Emails Free',
        accountLimit: 1,
        limit: 25,
        features: [
          'Connect 1 Gmail Account',
          '25 Total Lifetime Test Emails',
          'Basic Dynamic Tags ({{name}}, {{email}})',
          'Upgrade to Pro for PDF attachments & 2,000 emails'
        ]
      },
      {
        id: 'starter_2_99',
        name: 'Starter Pro (2,000 Emails)',
        price: 2.99,
        currency: 'USD',
        billing: '2,000 Emails Package ($2.99)',
        accountLimit: 1,
        limit: 2000,
        badge: 'POPULAR',
        promoBadge: '🎁 Use FIRST100 for 10% OFF ($2.69)',
        checkoutUrl: DEFAULT_CHECKOUT_URL,
        features: [
          '✅ 1 Connected Gmail / Workspace Account',
          '✅ 2,000 Emails Quota (Non-monthly / Send anytime)',
          '✅ Launch Promo: 10% OFF at Checkout ($2.69 for 2,000 emails) with code FIRST100',
          '✅ Cloudinary PDF & Image Attachments',
          '✅ Smart Anti-Spam Interval Throttling',
          '✅ CSV Mail Merge & Live SSE Dispatch',
          '✅ Real-time Open & Delivery Logging'
        ]
      }
    ]
  });
});

/**
 * GET /api/subscription/status/:email
 * Checks subscription status and quota for an account
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
    isLimitEnded: usage.isLimitEnded || usage.remaining <= 0,
    sentToday: usage.sentToday,
    sent: usage.sent,
    limit: usage.limit,
    remaining: usage.remaining,
    accountLimit: 1,
    expiryDate: usage.expiryDate,
    checkoutUrl: DEFAULT_CHECKOUT_URL.includes('gumroad.com')
      ? `${DEFAULT_CHECKOUT_URL}&email=${encodeURIComponent(cleanEmail)}`
      : `${DEFAULT_CHECKOUT_URL}?checkout[email]=${encodeURIComponent(cleanEmail)}`
  });
});

/**
 * GET /api/subscription/promo-info/:code
 * Checks promo code availability and remaining spots for the first 100 users
 */
router.get('/promo-info/:code', async (req, res) => {
  const cleanCode = (req.params.code || '').toUpperCase().trim();

  if (getIsConnected()) {
    try {
      let promo = await PromoCode.findOne({ code: cleanCode });
      if (!promo && cleanCode === 'FIRST100') {
        promo = await PromoCode.create({
          code: 'FIRST100',
          description: '10% OFF Checkout Promo ($2.69 for 2,000 Emails) for First 100 Users',
          maxUses: 100,
          usedCount: 0,
          discountPercent: 10,
          discountedPrice: 2.69,
          totalQuota: 2000,
          usedBy: []
        });
      }

      if (promo) {
        return res.json({
          success: true,
          code: promo.code,
          maxUses: promo.maxUses,
          usedCount: promo.usedCount,
          remainingSpots: Math.max(0, promo.maxUses - promo.usedCount),
          discountPercent: promo.discountPercent || 10,
          discountedPrice: promo.discountedPrice || 2.69,
          totalQuota: promo.totalQuota || 2000,
          isActive: promo.isActive && promo.usedCount < promo.maxUses
        });
      }
    } catch (e) {
      console.warn('[Subscription] DB promo check error:', e.message);
    }
  }

  // Local Memory Fallback
  if (cleanCode === 'FIRST100') {
    const promo = localPromoState.FIRST100;
    const used = promo.usedBy.size;
    return res.json({
      success: true,
      code: promo.code,
      maxUses: promo.maxUses,
      usedCount: used,
      remainingSpots: Math.max(0, promo.maxUses - used),
      discountPercent: promo.discountPercent,
      discountedPrice: promo.discountedPrice,
      totalQuota: promo.totalQuota,
      isActive: used < promo.maxUses
    });
  }

  res.status(404).json({ success: false, error: 'Promo code not found' });
});

/**
 * POST /api/subscription/apply-promo
 * Applies promo code for the first 100 users for 10% OFF checkout & 2,000 email quota
 */
router.post('/apply-promo', async (req, res) => {
  const { email, promoCode } = req.body;
  if (!email || !promoCode) {
    return res.status(400).json({ success: false, error: 'Email and promoCode are required' });
  }

  const cleanEmail = email.toLowerCase().trim();
  const cleanCode = promoCode.toUpperCase().trim();

  if (cleanCode !== 'FIRST100' && !cleanCode.startsWith('PROMO')) {
    return res.status(400).json({ success: false, error: 'Invalid promo code. Use FIRST100 to get 10% OFF ($2.69)!' });
  }

  let totalQuota = 2000;
  let remainingSpots = 100;

  if (getIsConnected()) {
    try {
      let promo = await PromoCode.findOne({ code: cleanCode });
      if (!promo && cleanCode === 'FIRST100') {
        promo = await PromoCode.create({
          code: 'FIRST100',
          description: '10% OFF Checkout Promo ($2.69 for 2,000 Emails) for First 100 Users',
          maxUses: 100,
          usedCount: 0,
          discountPercent: 10,
          discountedPrice: 2.69,
          totalQuota: 2000,
          usedBy: []
        });
      }

      if (!promo || !promo.isActive) {
        return res.status(400).json({ success: false, error: 'This promo code is no longer active.' });
      }

      if (promo.usedCount >= promo.maxUses) {
        return res.status(400).json({ success: false, error: 'Sorry! The first 100 promo spots have all been claimed.' });
      }

      if (promo.usedBy && promo.usedBy.includes(cleanEmail)) {
        return res.status(400).json({ success: false, error: 'You have already redeemed this promo code on this account.' });
      }

      // Record promo redemption
      promo.usedCount += 1;
      promo.usedBy.push(cleanEmail);
      await promo.save();

      totalQuota = promo.totalQuota || 2000;
      remainingSpots = Math.max(0, promo.maxUses - promo.usedCount);

      // Upgrade Account in DB
      let account = await Account.findOne({ email: cleanEmail });
      if (!account) {
        account = new Account({
          id: 'acc_' + Date.now(),
          email: cleanEmail,
          name: cleanEmail.split('@')[0]
        });
      }

      account.subscription.plan = 'starter_2_99';
      account.subscription.status = 'active';
      account.subscription.licenseKey = cleanCode;
      account.subscription.accountLimit = 1;
      if (!account.usage) {
        account.usage = { dailySentCount: 0, lastSentDate: new Date().toISOString().split('T')[0], dailyLimit: totalQuota, totalSentAllTime: 0, proSentCount: 0, proLimit: totalQuota };
      } else {
        account.usage.proSentCount = 0;
        account.usage.proLimit = totalQuota;
        account.usage.dailyLimit = totalQuota;
      }
      await account.save();

      return res.json({
        success: true,
        message: `🎉 Promo ${cleanCode} applied! You get 10% OFF ($2.69) for your 2,000 emails package! (${remainingSpots} spots remaining)`,
        plan: account.subscription.plan,
        status: account.subscription.status,
        limit: totalQuota,
        remaining: totalQuota,
        remainingSpots
      });
    } catch (err) {
      console.error('[Subscription] Promo redemption error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // Local JSON fallback
  const promo = localPromoState.FIRST100;
  if (promo.usedBy.has(cleanEmail)) {
    return res.status(400).json({ success: false, error: 'You have already redeemed this promo code on this account.' });
  }
  if (promo.usedBy.size >= promo.maxUses) {
    return res.status(400).json({ success: false, error: 'Sorry! The first 100 promo spots have all been claimed.' });
  }

  promo.usedBy.add(cleanEmail);
  remainingSpots = Math.max(0, promo.maxUses - promo.usedBy.size);

  const fs = require('fs');
  const path = require('path');
  const DATA_DIR = process.env.VERCEL ? path.join('/tmp', 'data') : path.join(__dirname, '../data');
  const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
  if (fs.existsSync(ACCOUNTS_FILE)) {
    try {
      const raw = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
      const accounts = JSON.parse(raw);
      const acc = accounts.find(a => a.email.toLowerCase() === cleanEmail);
      if (acc) {
        acc.subscription = { plan: 'starter_2_99', status: 'active', accountLimit: 1, licenseKey: cleanCode };
        if (!acc.usage) acc.usage = { dailySentCount: 0, lastSentDate: new Date().toISOString().split('T')[0], dailyLimit: totalQuota, totalSentAllTime: 0 };
        acc.usage.proSentCount = 0;
        acc.usage.proLimit = totalQuota;
        acc.usage.dailyLimit = totalQuota;
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf8');
      }
    } catch (e) { }
  }

  res.json({
    success: true,
    message: `🎉 Promo ${cleanCode} applied! You get 10% OFF ($2.69) for your 2,000 emails package! (${remainingSpots} spots remaining)`,
    plan: 'starter_2_99',
    status: 'active',
    limit: totalQuota,
    remaining: totalQuota,
    remainingSpots
  });
});

/**
 * POST /api/subscription/activate-license
 * Activates a $2.99 license key or promo code for an account (2,000 email quota)
 */
router.post('/activate-license', async (req, res) => {
  const { email, licenseKey } = req.body;

  if (!email || !licenseKey) {
    return res.status(400).json({ success: false, error: 'Email and licenseKey are required' });
  }

  const cleanEmail = email.toLowerCase().trim();
  const cleanKey = licenseKey.toUpperCase().trim();

  // If user enters promo code FIRST100 in license key box, redirect to promo flow
  if (cleanKey === 'FIRST100') {
    return router.handle({ method: 'POST', url: '/apply-promo', body: { email: cleanEmail, promoCode: cleanKey } }, res);
  }

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

      // Update Account in DB — reset proSentCount to 0 and grant fresh 2,000 quota
      let account = await Account.findOne({ email: cleanEmail });
      if (!account) {
        account = new Account({
          id: 'acc_' + Date.now(),
          email: cleanEmail,
          name: cleanEmail.split('@')[0]
        });
      }

      account.subscription.plan = 'starter_2_99';
      account.subscription.status = 'active';
      account.subscription.licenseKey = cleanKey;
      account.subscription.accountLimit = 1;
      if (!account.usage) {
        account.usage = { dailySentCount: 0, lastSentDate: new Date().toISOString().split('T')[0], dailyLimit: 2000, totalSentAllTime: 0, proSentCount: 0, proLimit: 2000 };
      } else {
        account.usage.proSentCount = 0;
        account.usage.proLimit = 2000;
        account.usage.dailyLimit = 2000;
      }
      await account.save();

      return res.json({
        success: true,
        message: '🎉 $2.99 Starter Plan (2,000 Emails Quota) activated successfully!',
        plan: account.subscription.plan,
        status: account.subscription.status,
        limit: 2000,
        remaining: 2000,
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
    message: '🎉 License activated (Local Mode) - 2,000 Emails Quota!',
    plan: 'starter_2_99',
    status: 'active',
    limit: 2000,
    remaining: 2000,
    accountLimit: 1
  });
});

/**
 * POST /api/subscription/simulate-upgrade
 * Quick helper for testing / developer verification (resets 2,000 quota)
 */
router.post('/simulate-upgrade', async (req, res) => {
  const { email, plan = 'starter_2_99' } = req.body;
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
            'subscription.accountLimit': 1,
            'usage.proSentCount': 0,
            'usage.proLimit': 2000,
            'usage.dailyLimit': 2000
          }
        },
        { upsert: true, returnDocument: 'after' }
      );
      return res.json({ success: true, message: `Account upgraded to ${plan} with 2,000 emails quota!`, account });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // Local JSON fallback
  const fs = require('fs');
  const path = require('path');
  const DATA_DIR = process.env.VERCEL ? path.join('/tmp', 'data') : path.join(__dirname, '../data');
  const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
  if (fs.existsSync(ACCOUNTS_FILE)) {
    try {
      const raw = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
      const accounts = JSON.parse(raw);
      const acc = accounts.find(a => a.email.toLowerCase() === cleanEmail);
      if (acc) {
        acc.subscription = { plan: 'starter_2_99', status: 'active', accountLimit: 1 };
        if (!acc.usage) acc.usage = { dailySentCount: 0, lastSentDate: new Date().toISOString().split('T')[0], dailyLimit: 2000, totalSentAllTime: 0 };
        acc.usage.proSentCount = 0;
        acc.usage.proLimit = 2000;
        acc.usage.dailyLimit = 2000;
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf8');
      }
    } catch (e) { }
  }

  res.json({ success: true, message: `Simulated upgrade to ${plan} (2,000 Emails Quota)` });
});

/**
 * POST /api/subscription/webhook
 * Webhook endpoint for Lemon Squeezy / Payment Providers
 */
router.post('/webhook', async (req, res) => {
  try {
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    const signature = req.headers['x-signature'];

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
        // 1. Sync in MongoDB — grant fresh 2,000 emails quota
        if (getIsConnected()) {
          await Account.findOneAndUpdate(
            { email: customerEmail },
            {
              $set: {
                'subscription.plan': 'starter_2_99',
                'subscription.status': 'active',
                'subscription.accountLimit': 1,
                'subscription.lemonSqueezyCustomerId': attributes.customer_id ? String(attributes.customer_id) : null,
                'subscription.lemonSqueezySubscriptionId': payload.data.id ? String(payload.data.id) : null,
                'usage.proSentCount': 0,
                'usage.proLimit': 2000,
                'usage.dailyLimit': 2000
              }
            },
            { upsert: true, returnDocument: 'after' }
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
              acc.subscription = { plan: 'starter_2_99', status: 'active', accountLimit: 1 };
              if (!acc.usage) acc.usage = { dailySentCount: 0, lastSentDate: new Date().toISOString().split('T')[0], dailyLimit: 2000, totalSentAllTime: 0 };
              acc.usage.proSentCount = 0;
              acc.usage.proLimit = 2000;
              acc.usage.dailyLimit = 2000;
              fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf8');
            }
          } catch (e) { }
        }

        console.log(`[Webhook] 🟢 Successfully upgraded ${customerEmail} to Starter Pro (2,000 Emails)!`);
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

/**
 * POST /api/subscription/gumroad-webhook
 * Gumroad Ping Webhook Handler for sales, subscriptions, and cancellations
 */
router.post('/gumroad-webhook', async (req, res) => {
  try {
    const payload = req.body || {};
    const customerEmail = (payload.email || payload.buyer_email)?.toLowerCase().trim();
    const productPermalink = payload.permalink || payload.product_permalink || payload.short_product_id;
    const isCancelled = payload.cancelled === 'true' || payload.subscription_cancelled === 'true' || payload.refunded === 'true';
    const saleId = payload.sale_id || payload.order_number;
    const licenseKey = payload.license_key || null;

    console.log(`[Gumroad Webhook] 📥 Received Gumroad Ping for email: "${customerEmail}", permalink: "${productPermalink}", cancelled: ${isCancelled}`);

    if (customerEmail) {
      if (isCancelled) {
        if (getIsConnected()) {
          await Account.findOneAndUpdate(
            { email: customerEmail },
            { $set: { 'subscription.status': 'expired' } }
          );
        }
        console.log(`[Gumroad Webhook] ⚠️ Subscription cancelled for ${customerEmail}`);
      } else {
        // Activate Starter Pro ($2.99 for 2,000 emails)
        if (getIsConnected()) {
          await Account.findOneAndUpdate(
            { email: customerEmail },
            {
              $set: {
                'subscription.plan': 'starter_2_99',
                'subscription.status': 'active',
                'subscription.accountLimit': 1,
                'subscription.gumroadSaleId': saleId ? String(saleId) : null,
                'subscription.licenseKey': licenseKey ? String(licenseKey) : null,
                'usage.proSentCount': 0,
                'usage.proLimit': 2000,
                'usage.dailyLimit': 2000
              }
            },
            { upsert: true, returnDocument: 'after' }
          );
        }

        // Local JSON Fallback Sync
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
              acc.subscription = { plan: 'starter_2_99', status: 'active', accountLimit: 1, licenseKey };
              if (!acc.usage) acc.usage = { dailySentCount: 0, lastSentDate: new Date().toISOString().split('T')[0], dailyLimit: 2000, totalSentAllTime: 0 };
              acc.usage.proSentCount = 0;
              acc.usage.proLimit = 2000;
              acc.usage.dailyLimit = 2000;
              fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf8');
            }
          } catch (e) { }
        }

        console.log(`[Gumroad Webhook] 🟢 Successfully upgraded ${customerEmail} to Starter Pro (2,000 Emails) via Gumroad!`);
      }
    }

    res.json({ success: true, received: true, email: customerEmail });
  } catch (err) {
    console.error('[Gumroad Webhook] Error processing ping:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

