const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');
const { sendGmailMessage } = require('./gmailService');
const { getDailyUsage, incrementDailySent } = require('./tokenService');
const { getIsConnected } = require('../config/db');
const Campaign = require('../models/Campaign');
const Account = require('../models/Account');

class CampaignQueueService extends EventEmitter {
  constructor() {
    super();
    this.jobs = new Map(); // jobId -> Job details & state
    this.sseClients = new Map(); // jobId -> Set of Express response objects
  }

  /**
   * Helper: Replace template variables like {{name}} or {{company}}
   */
  replacePlaceholders(template, data) {
    if (!template) return '';
    return template.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/gi, (match, key) => {
      const matchingKey = Object.keys(data).find(
        k => k.trim().toLowerCase() === key.trim().toLowerCase()
      );
      if (matchingKey && data[matchingKey] !== undefined && data[matchingKey] !== null) {
        return data[matchingKey];
      }
      return match;
    });
  }

  /**
   * Create and start a new bulk sending campaign
   */
  createCampaign({ senderEmail, recipients, subjectTemplate, bodyTemplate, attachments = [], profileId }) {
    const jobId = uuidv4();
    const FIXED_DELAY_MS = 3000; // Fixed 3 second delay between emails
    
    // Normalize recipients
    const normalizedRecipients = recipients.map((r, index) => {
      if (typeof r === 'string') {
        return { email: r.trim(), name: r.split('@')[0], index };
      }
      return {
        ...r,
        email: (r.email || r.Email || r.EMAIL || '').trim(),
        name: r.name || r.Name || r.NAME || (r.email ? r.email.split('@')[0] : ''),
        index
      };
    }).filter(r => r.email && r.email.includes('@'));

    console.log(`[QueueService] Creating campaign: ${normalizedRecipients.length} recipients, sender: ${senderEmail}`);

    const job = {
      id: jobId,
      senderEmail,
      total: normalizedRecipients.length,
      sent: 0,
      failed: 0,
      status: 'pending',
      recipients: normalizedRecipients,
      subjectTemplate,
      bodyTemplate,
      attachments: Array.isArray(attachments) ? attachments : [],
      profileId: profileId || null,
      delayMs: FIXED_DELAY_MS,
      currentIndex: 0,
      logs: [],
      createdAt: new Date().toISOString()
    };

    this.jobs.set(jobId, job);
    this.sseClients.set(jobId, new Set());

    // Save initial campaign record to MongoDB
    if (getIsConnected()) {
      Campaign.create({
        jobId,
        senderEmail,
        subjectTemplate,
        bodyTemplate,
        attachments: job.attachments,
        totalRecipients: job.total,
        status: 'pending',
        delayMs: 3000
      }).catch(err => console.warn('[QueueService] DB save campaign init:', err.message));
    }

    // Start processing after SSE client has time to connect (500ms grace period)
    setTimeout(() => this.processJob(jobId), 500);

    return job;
  }

  /**
   * Main Queue Processing Loop
   */
  async processJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'running';
    this.emitEvent(jobId, 'status', { status: job.status, message: 'Campaign started' });
    console.log(`[QueueService] Job ${jobId} started. Total recipients: ${job.recipients.length}`);

    try {
      while (job.currentIndex < job.recipients.length) {
        if (job.status === 'paused') {
          this.emitEvent(jobId, 'status', { status: 'paused', message: 'Campaign paused' });
          break; // use break so finally still runs
        }
        if (job.status === 'stopped') {
          this.emitEvent(jobId, 'status', { status: 'stopped', message: 'Campaign stopped by user' });
          break; // use break so finally still runs
        }

        const recipient = job.recipients[job.currentIndex];
        console.log(`[QueueService] Processing recipient ${job.currentIndex + 1}/${job.total}: ${recipient.email}`);
        const personalizedSubject = this.replacePlaceholders(job.subjectTemplate, recipient);
        const personalizedBody = this.replacePlaceholders(job.bodyTemplate, recipient);

        const logEntry = {
          index: job.currentIndex + 1,
          email: recipient.email,
          name: recipient.name,
          timestamp: new Date().toISOString(),
          status: 'pending',
          error: null
        };

        // Check real-time quota limit
        try {
          const usage = await getDailyUsage(job.senderEmail, job.profileId);
          console.log(`[QueueService] Quota check: sent=${usage.sent}, limit=${usage.limit}, remaining=${usage.remaining}, isPro=${usage.isPro}`);
          if (usage.remaining <= 0 || (!usage.isPro && usage.sent >= usage.limit)) {
            logEntry.status = 'failed';
            const isProPlan = usage.plan === 'starter_2_99' || usage.plan === 'starter_1_99' || usage.plan === 'pro';
            logEntry.error = isProPlan 
              ? `Pro 2,000 emails quota ended (${usage.sent || 2000}/2,000 used). Please upgrade to renew your 2,000 emails package!`
              : `Free Trial limit reached (${usage.sent}/${usage.limit} emails used). Please upgrade to Starter Pro ($2.99) for 2,000 emails!`;
            job.failed++;
            job.logs.push(logEntry);

            this.emitEvent(jobId, 'email_failed', {
              jobId,
              sent: job.sent,
              failed: job.failed,
              total: job.total,
              current: job.currentIndex + 1,
              log: logEntry,
              upgradeRequired: true
            });

            job.currentIndex++;
            continue;
          }
        } catch (uErr) {
          console.warn('[QueueService] Usage check warning:', uErr.message);
        }

        try {
          console.log(`[QueueService] Sending email to: ${recipient.email}`);
          await sendGmailMessage({
            fromEmail: job.senderEmail,
            toEmail: recipient.email,
            subject: personalizedSubject,
            htmlBody: personalizedBody,
            textBody: personalizedBody.replace(/<[^>]*>?/gm, ''),
            attachments: job.attachments,
            profileId: job.profileId
          });

          job.sent++;
          logEntry.status = 'success';
          job.logs.push(logEntry);
          console.log(`[QueueService] ✓ Sent to ${recipient.email}. Total sent: ${job.sent}`);

          // Increment daily sent quota
          incrementDailySent(job.senderEmail, job.profileId).catch(e => console.warn('[QueueService] incrementDailySent warn:', e.message));

          // Persist progress to MongoDB immediately (survives server restarts)
          if (getIsConnected()) {
            Campaign.updateOne({ jobId }, { $set: { sentCount: job.sent, failedCount: job.failed, status: 'running' }, $push: { logs: logEntry } })
              .catch(e => console.warn('[QueueService] DB progress update warn:', e.message));
          }

          this.emitEvent(jobId, 'email_sent', {
            jobId,
            sent: job.sent,
            failed: job.failed,
            total: job.total,
            current: job.currentIndex + 1,
            log: logEntry
          });
        } catch (err) {
          console.error(`[QueueService] ✗ Failed to send to ${recipient.email}:`, err.message);
          job.failed++;
          logEntry.status = 'failed';
          logEntry.error = err.message || 'Failed to send';
          job.logs.push(logEntry);

          // Persist failure to MongoDB immediately
          if (getIsConnected()) {
            Campaign.updateOne({ jobId }, { $set: { sentCount: job.sent, failedCount: job.failed, status: 'running' }, $push: { logs: logEntry } })
              .catch(e => console.warn('[QueueService] DB failure update warn:', e.message));
          }

          this.emitEvent(jobId, 'email_failed', {
            jobId,
            sent: job.sent,
            failed: job.failed,
            total: job.total,
            current: job.currentIndex + 1,
            log: logEntry
          });
        }

        job.currentIndex++;

        // Fixed 3s delay between emails
        if (job.currentIndex < job.recipients.length && job.status === 'running') {
          console.log(`[QueueService] Waiting 3s before next email...`);
          this.emitEvent(jobId, 'delay', {
            delayMs: job.delayMs,
            nextIndex: job.currentIndex + 1,
            total: job.total,
            sent: job.sent,
            failed: job.failed
          });
          await new Promise(res => setTimeout(res, job.delayMs));
        }
      }
    } catch (globalErr) {
      console.error('[QueueService] Critical process error:', globalErr);
    } finally {
      job.status = 'completed';
      this.emitEvent(jobId, 'completed', {
        jobId,
        total: job.total,
        sent: job.sent,
        failed: job.failed,
        logs: job.logs
      });

      // Update MongoDB Campaign
      if (getIsConnected()) {
        Campaign.updateOne(
          { jobId },
          {
            $set: {
              status: 'completed',
              sentCount: job.sent,
              failedCount: job.failed,
              logs: job.logs,
              completedAt: new Date()
            }
          }
        ).catch(err => console.warn('[QueueService] DB update campaign complete:', err.message));
      }
    }
  }

  pauseCampaign(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error('Campaign job not found');
    if (job.status === 'running') {
      job.status = 'paused';
      this.emitEvent(jobId, 'status', { status: 'paused', message: 'Campaign paused' });
      if (getIsConnected()) {
        Campaign.updateOne({ jobId }, { $set: { status: 'paused' } }).catch(() => {});
      }
    }
    return job;
  }

  resumeCampaign(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error('Campaign job not found');
    if (job.status === 'paused') {
      job.status = 'running';
      this.emitEvent(jobId, 'status', { status: 'running', message: 'Campaign resumed' });
      if (getIsConnected()) {
        Campaign.updateOne({ jobId }, { $set: { status: 'running' } }).catch(() => {});
      }
      this.processJob(jobId);
    }
    return job;
  }

  stopCampaign(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error('Campaign job not found');
    job.status = 'stopped';
    this.emitEvent(jobId, 'status', { status: 'stopped', message: 'Campaign stopped' });
    if (getIsConnected()) {
      Campaign.updateOne({ jobId }, { $set: { status: 'stopped' } }).catch(() => {});
    }
    return job;
  }

  getCampaign(jobId) {
    return this.jobs.get(jobId);
  }

  addSseClient(jobId, res) {
    if (!this.sseClients.has(jobId)) {
      this.sseClients.set(jobId, new Set());
    }
    this.sseClients.get(jobId).add(res);

    res.on('close', () => {
      const clients = this.sseClients.get(jobId);
      if (clients) {
        clients.delete(res);
      }
    });
  }

  emitEvent(jobId, eventType, data) {
    const clients = this.sseClients.get(jobId);
    if (!clients || clients.size === 0) return;

    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) {
      try {
        client.write(payload);
        if (typeof client.flush === 'function') {
          client.flush();
        }
      } catch (err) {
        console.error('[QueueService] Error writing SSE event:', err);
      }
    }
  }
}

module.exports = new CampaignQueueService();
