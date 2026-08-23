const express = require('express');
const router = express.Router();
const queueService = require('../services/queueService');
const Campaign = require('../models/Campaign');
const Account = require('../models/Account');
const { getIsConnected } = require('../config/db');
const { getAccount, getDailyUsage, listAccounts } = require('../services/tokenService');

const CHECKOUT_URL = process.env.GUMROAD_CHECKOUT_URL || 'https://muhammadanique.gumroad.com/l/wlgzrc?wanted=true';

/**
 * POST /api/campaign/start
 * Starts a new bulk email sending campaign with free trial 5-email/day enforcement
 */
router.post('/start', async (req, res) => {
  const { senderEmail, recipients, subjectTemplate, bodyTemplate, attachments } = req.body;
  const profileId = req.headers['x-profile-id'] || null;

  if (!senderEmail) {
    return res.status(400).json({ success: false, error: 'Sender email is required' });
  }

  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ success: false, error: 'Recipient list cannot be empty' });
  }

  if (!subjectTemplate) {
    return res.status(400).json({ success: false, error: 'Subject / Title is required' });
  }

  if (!bodyTemplate) {
    return res.status(400).json({ success: false, error: 'Message body is required' });
  }

  const cleanSender = senderEmail.toLowerCase().trim();
  const prefilledCheckout = CHECKOUT_URL.includes('gumroad.com')
    ? `${CHECKOUT_URL}&email=${encodeURIComponent(cleanSender)}`
    : `${CHECKOUT_URL}?checkout[email]=${encodeURIComponent(cleanSender)}`;

  // 1. Check Plan Status & Real-time Usage for this Sender Account
  const usage = await getDailyUsage(cleanSender, profileId);

  // 2. Enforce Plan Limits
  if (!usage.isPro) {
    const isProExpired = (usage.plan === 'starter_2_99' || usage.plan === 'starter_1_99' || usage.plan === 'pro') && (usage.remaining <= 0 || usage.status === 'expired' || usage.isLimitEnded);
    
    if (isProExpired) {
      return res.status(403).json({
        success: false,
        upgradeRequired: true,
        error: `Your 2,000 emails Pro quota has ended (${usage.sent || 2000}/2,000 used). Please upgrade to renew your 2,000 emails package!`,
        checkoutUrl: prefilledCheckout
      });
    }

    const FREE_LIMIT = usage.limit || 25;
    const sentCount = usage.sent || 0;

    // Check if free trial limit reached
    if (sentCount >= FREE_LIMIT || usage.remaining <= 0) {
      return res.status(403).json({
        success: false,
        upgradeRequired: true,
        error: `Free Trial limit reached (${sentCount}/${FREE_LIMIT} emails used). Please upgrade to Starter Pro ($2.99) for 2,000 emails!`,
        checkoutUrl: prefilledCheckout
      });
    }

    // Check recipients count vs remaining quota
    if (recipients.length > (FREE_LIMIT - sentCount)) {
      const remaining = Math.max(0, FREE_LIMIT - sentCount);
      return res.status(403).json({
        success: false,
        upgradeRequired: true,
        error: `You have ${remaining} emails left (${sentCount}/${FREE_LIMIT} used), but entered ${recipients.length} recipients. Upgrade to Starter Pro ($2.99) for 2,000 emails!`,
        checkoutUrl: prefilledCheckout
      });
    }

    // Check attachment restrictions
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      return res.status(403).json({
        success: false,
        upgradeRequired: true,
        error: 'PDF and file attachments require an active Starter Pro ($2.99) plan.',
        checkoutUrl: prefilledCheckout
      });
    }
  } else {
    // Pro user active - verify recipient count does not exceed remaining Pro quota
    if (recipients.length > usage.remaining) {
      return res.status(403).json({
        success: false,
        upgradeRequired: true,
        error: `You have ${usage.remaining} emails remaining in your 2,000 email Pro quota, but entered ${recipients.length} recipients. Please reduce recipients or upgrade to renew your quota.`,
        checkoutUrl: prefilledCheckout
      });
    }
  }

  try {
    const job = queueService.createCampaign({
      senderEmail: cleanSender,
      recipients,
      subjectTemplate,
      bodyTemplate,
      attachments: Array.isArray(attachments) ? attachments : [],
      profileId
    });

    res.json({
      success: true,
      jobId: job.id,
      totalRecipients: job.total,
      attachmentsCount: (job.attachments || []).length,
      message: 'Campaign scheduled successfully'
    });
  } catch (err) {
    console.error('Error starting campaign:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/campaign/history
 * Get past campaign history from MongoDB (filtered by connected sender email)
 */
router.get('/history', async (req, res) => {
  const profileId = req.headers['x-profile-id'] || null;
  const senderEmail = (req.query.senderEmail || req.query.email || '').toLowerCase().trim();

  if (getIsConnected()) {
    try {
      const query = {};
      if (senderEmail) {
        query.senderEmail = senderEmail;
      } else if (profileId) {
        const accounts = listAccounts(profileId);
        if (accounts.length > 0) {
          query.senderEmail = { $in: accounts.map(a => a.email.toLowerCase()) };
        } else {
          return res.json({ success: true, campaigns: [] });
        }
      }

      const campaigns = await Campaign.find(query)
        .sort({ createdAt: -1 })
        .limit(50)
        .select('-logs')
        .lean();
      return res.json({ success: true, campaigns });
    } catch (err) {
      console.warn('[CampaignRoutes] History fetch error:', err.message);
    }
  }
  res.json({ success: true, campaigns: [] });
});

/**
 * GET /api/campaign/stream/:jobId
 * Server-Sent Events (SSE) endpoint for live streaming of dispatch progress
 */
router.get('/stream/:jobId', async (req, res) => {
  const { jobId } = req.params;
  let job = queueService.getCampaign(jobId);

  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  if (job) {
    res.write(`event: initial_state\ndata: ${JSON.stringify({
      jobId: job.id,
      status: job.status,
      total: job.total,
      sent: job.sent,
      failed: job.failed,
      logs: job.logs
    })}\n\n`);

    queueService.addSseClient(jobId, res);
  } else if (getIsConnected()) {
    try {
      const doc = await Campaign.findOne({ jobId }).lean();
      if (doc) {
        res.write(`event: initial_state\ndata: ${JSON.stringify({
          jobId: doc.jobId,
          status: doc.status,
          total: doc.totalRecipients,
          sent: doc.sentCount,
          failed: doc.failedCount,
          logs: doc.logs || []
        })}\n\n`);
      }
    } catch (e) { }
  }
});

/**
 * GET /api/campaign/:jobId/status
 * Always merges in-memory + MongoDB — takes whichever is most complete
 */
router.get('/:jobId/status', async (req, res) => {
  const { jobId } = req.params;
  const memJob = queueService.getCampaign(jobId);

  let dbDoc = null;
  if (getIsConnected()) {
    try {
      dbDoc = await Campaign.findOne({ jobId }).lean();
    } catch (e) { }
  }

  // Nothing at all
  if (!memJob && !dbDoc) {
    return res.status(404).json({ success: false, error: 'Campaign job not found' });
  }

  // Merge: prefer the state that is further along
  const memSent = memJob ? (memJob.sent || 0) : 0;
  const memFailed = memJob ? (memJob.failed || 0) : 0;
  const memTotal = memJob ? (memJob.total || 0) : 0;
  const memStatus = memJob ? memJob.status : null;
  const memLogs = memJob ? (memJob.logs || []) : [];

  const dbSent = dbDoc ? (dbDoc.sentCount || 0) : 0;
  const dbFailed = dbDoc ? (dbDoc.failedCount || 0) : 0;
  const dbTotal = dbDoc ? (dbDoc.totalRecipients || 0) : 0;
  const dbStatus = dbDoc ? dbDoc.status : null;
  const dbLogs = dbDoc ? (dbDoc.logs || []) : [];

  // Take highest counts (most complete)
  const sent = Math.max(memSent, dbSent);
  const failed = Math.max(memFailed, dbFailed);
  const total = Math.max(memTotal, dbTotal);

  // Status: completed > stopped > running > pending
  const rankStatus = s => ({ completed: 4, stopped: 3, running: 2, pending: 1 }[s] || 0);
  const status = rankStatus(memStatus) >= rankStatus(dbStatus) ? (memStatus || dbStatus) : (dbStatus || memStatus);

  // Logs: take whichever list is longer
  const logs = memLogs.length >= dbLogs.length ? memLogs : dbLogs;

  res.json({ success: true, job: { id: jobId, status, total, sent, failed, logs } });
});

/**
 * POST /api/campaign/:jobId/pause
 */
router.post('/:jobId/pause', (req, res) => {
  try {
    const job = queueService.pauseCampaign(req.params.jobId);
    res.json({ success: true, status: job.status });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/campaign/:jobId/resume
 */
router.post('/:jobId/resume', (req, res) => {
  try {
    const job = queueService.resumeCampaign(req.params.jobId);
    res.json({ success: true, status: job.status });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/campaign/:jobId/stop
 */
router.post('/:jobId/stop', (req, res) => {
  try {
    const job = queueService.stopCampaign(req.params.jobId);
    res.json({ success: true, status: job.status });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
