const fs = require('fs');
const path = require('path');
const { getOAuth2Client } = require('../config/googleAuth');
const { getIsConnected } = require('../config/db');
const Account = require('../models/Account');

const DATA_DIR = process.env.VERCEL 
  ? path.join('/tmp', 'data') 
  : path.join(__dirname, '../data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');

// Ensure data directory exists
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('Directory check:', e.message);
}

function loadAccounts() {
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error loading accounts:', err);
    return [];
  }
}

function saveAccounts(accounts) {
  try {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving accounts:', err);
  }
}

/**
 * Check if user is allowed to add another account based on plan limits
 */
async function checkAccountLimit(email) {
  const accounts = loadAccounts();
  const existing = accounts.find(a => a.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    return { allowed: true, count: accounts.length };
  }

  if (getIsConnected()) {
    try {
      const dbAccounts = await Account.find({}).lean();
      if (dbAccounts.length >= 1) {
        const hasMultiPlan = dbAccounts.some(a => a.subscription && a.subscription.accountLimit > 1);
        if (!hasMultiPlan && dbAccounts.length >= 1) {
          return {
            allowed: false,
            count: dbAccounts.length,
            limit: 1,
            message: 'Your plan includes 1 connected Gmail account. Please upgrade to add more sender accounts.'
          };
        }
      }
    } catch (e) {
      console.warn('[TokenService] DB limit check error:', e.message);
    }
  }

  return { allowed: true, count: accounts.length };
}

/**
 * Save or update OAuth Google account tokens (MongoDB + JSON fallback)
 */
async function saveAccount(profile, tokens) {
  const accounts = loadAccounts();
  const cleanEmail = profile.email.toLowerCase().trim();
  const existingIdx = accounts.findIndex(a => a.email.toLowerCase() === cleanEmail);

  let existingAccount = null;
  if (getIsConnected()) {
    try {
      existingAccount = await Account.findOne({ email: cleanEmail });
    } catch (e) {}
  }

  const defaultPlan = (existingAccount && existingAccount.subscription) 
    ? existingAccount.subscription.plan 
    : ((existingIdx >= 0 && accounts[existingIdx].subscription) ? accounts[existingIdx].subscription.plan : 'free');

  const defaultStatus = (existingAccount && existingAccount.subscription) 
    ? existingAccount.subscription.status 
    : ((existingIdx >= 0 && accounts[existingIdx].subscription) ? accounts[existingIdx].subscription.status : 'trial');

  const accountData = {
    id: profile.id || Date.now().toString(),
    type: 'oauth',
    email: cleanEmail,
    name: profile.name || profile.email.split('@')[0],
    picture: profile.picture || '',
    tokens: {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || (existingIdx !== -1 && accounts[existingIdx].tokens ? accounts[existingIdx].tokens.refresh_token : null),
      expiry_date: tokens.expiry_date,
      token_type: tokens.token_type,
      scope: tokens.scope
    },
    subscription: {
      plan: defaultPlan,
      status: defaultStatus,
      accountLimit: 1
    },
    usage: {
      dailySentCount: (existingAccount && existingAccount.usage) ? existingAccount.usage.dailySentCount : 0,
      lastSentDate: new Date().toISOString().split('T')[0],
      dailyLimit: defaultPlan === 'starter_1_99' ? 2000 : 5
    },
    connectedAt: new Date().toISOString()
  };

  if (existingIdx >= 0) {
    accounts[existingIdx] = accountData;
  } else {
    accounts.push(accountData);
  }

  saveAccounts(accounts);

  // Sync to MongoDB
  if (getIsConnected()) {
    try {
      await Account.findOneAndUpdate(
        { email: accountData.email },
        { 
          $set: {
            id: accountData.id,
            type: accountData.type,
            name: accountData.name,
            picture: accountData.picture,
            tokens: accountData.tokens,
            connectedAt: accountData.connectedAt
          },
          $setOnInsert: {
            subscription: accountData.subscription,
            usage: accountData.usage
          }
        },
        { upsert: true, new: true }
      );
      console.log(`[MongoDB] 🟢 Account synced: ${accountData.email}`);
    } catch (dbErr) {
      console.warn('[MongoDB] Sync account error:', dbErr.message);
    }
  }

  return accountData;
}

/**
 * Save manual business Gmail / Custom SMTP (using Password / App Password)
 */
async function saveManualAccount({ email, name, appPassword, host, port, secure }) {
  const accounts = loadAccounts();
  const cleanEmail = email.toLowerCase().trim();
  const cleanPass = appPassword ? appPassword.replace(/\s+/g, '').trim() : '';
  const existingIdx = accounts.findIndex(a => a.email.toLowerCase() === cleanEmail);

  let existingAccount = null;
  if (getIsConnected()) {
    try {
      existingAccount = await Account.findOne({ email: cleanEmail });
    } catch (e) {}
  }

  const defaultPlan = (existingAccount && existingAccount.subscription) 
    ? existingAccount.subscription.plan 
    : ((existingIdx >= 0 && accounts[existingIdx].subscription) ? accounts[existingIdx].subscription.plan : 'free');

  const defaultStatus = (existingAccount && existingAccount.subscription) 
    ? existingAccount.subscription.status 
    : ((existingIdx >= 0 && accounts[existingIdx].subscription) ? accounts[existingIdx].subscription.status : 'trial');

  const accountData = {
    id: 'manual_' + Date.now().toString(),
    type: 'smtp',
    email: cleanEmail,
    name: name ? name.trim() : cleanEmail.split('@')[0],
    picture: '',
    smtp: {
      host: host ? host.trim() : 'smtp.gmail.com',
      port: port ? parseInt(port, 10) : 465,
      secure: secure !== undefined ? Boolean(secure) : (parseInt(port || 465, 10) === 465),
      user: cleanEmail,
      pass: cleanPass
    },
    subscription: {
      plan: defaultPlan,
      status: defaultStatus,
      accountLimit: 1
    },
    usage: {
      dailySentCount: (existingAccount && existingAccount.usage) ? existingAccount.usage.dailySentCount : 0,
      lastSentDate: new Date().toISOString().split('T')[0],
      dailyLimit: defaultPlan === 'starter_1_99' ? 2000 : 5
    },
    connectedAt: new Date().toISOString()
  };

  if (existingIdx >= 0) {
    accounts[existingIdx] = accountData;
  } else {
    accounts.push(accountData);
  }

  saveAccounts(accounts);

  // Sync to MongoDB
  if (getIsConnected()) {
    try {
      await Account.findOneAndUpdate(
        { email: accountData.email },
        { 
          $set: {
            id: accountData.id,
            type: accountData.type,
            name: accountData.name,
            smtp: accountData.smtp,
            connectedAt: accountData.connectedAt
          },
          $setOnInsert: {
            subscription: accountData.subscription,
            usage: accountData.usage
          }
        },
        { upsert: true, new: true }
      );
      console.log(`[MongoDB] 🟢 Manual Account synced: ${accountData.email}`);
    } catch (dbErr) {
      console.warn('[MongoDB] Sync manual account error:', dbErr.message);
    }
  }

  return accountData;
}

/**
 * List all connected accounts
 */
function listAccounts() {
  const accounts = loadAccounts();
  return accounts.map(a => ({
    id: a.id,
    type: a.type || (a.smtp ? 'smtp' : 'oauth'),
    email: a.email,
    name: a.name,
    picture: a.picture,
    subscription: a.subscription || { plan: 'free', status: 'trial', accountLimit: 1 },
    connectedAt: a.connectedAt
  }));
}

/**
 * Get account by email
 */
function getAccount(email) {
  const cleanEmail = (email || '').toLowerCase().trim();
  const accounts = loadAccounts();
  return accounts.find(a => a.email.toLowerCase() === cleanEmail);
}

/**
 * Delete account by email
 */
async function deleteAccount(email) {
  const cleanEmail = (email || '').toLowerCase().trim();
  let accounts = loadAccounts();
  const before = accounts.length;
  accounts = accounts.filter(a => a.email.toLowerCase() !== cleanEmail);
  saveAccounts(accounts);

  if (getIsConnected()) {
    try {
      await Account.deleteOne({ email: cleanEmail });
      console.log(`[MongoDB] 🗑️ Deleted account from DB: ${cleanEmail}`);
    } catch (e) {
      console.warn('[MongoDB] Delete error:', e.message);
    }
  }

  return accounts.length < before;
}

/**
 * Get authorized OAuth2Client for a specific sender email (OAuth only)
 */
async function getAuthenticatedClient(email) {
  const account = getAccount(email);

  if (!account) {
    throw new Error(`Account ${email} is not connected.`);
  }

  if (account.type === 'smtp' || !account.tokens) {
    throw new Error(`Account ${email} is configured with App Password (SMTP), not OAuth.`);
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(account.tokens);

  oauth2Client.on('tokens', async (newTokens) => {
    if (newTokens.refresh_token) {
      account.tokens.refresh_token = newTokens.refresh_token;
    }
    account.tokens.access_token = newTokens.access_token;
    account.tokens.expiry_date = newTokens.expiry_date;
    await saveAccount({ email: account.email, name: account.name, picture: account.picture, id: account.id }, account.tokens);
    console.log(`[TokenService] Access token refreshed for ${account.email}`);
  });

  return oauth2Client;
}

/**
 * Get daily quota usage for an email
 */
async function getDailyUsage(email) {
  const cleanEmail = (email || '').toLowerCase().trim();
  const todayStr = new Date().toISOString().split('T')[0];

  if (getIsConnected()) {
    try {
      const dbAcc = await Account.findOne({ email: cleanEmail });
      if (dbAcc) {
        const isPro = dbAcc.subscription && (dbAcc.subscription.plan === 'starter_1_99' || dbAcc.subscription.plan === 'pro') && dbAcc.subscription.status === 'active';
        const sentToday = (dbAcc.usage && dbAcc.usage.lastSentDate === todayStr) ? (dbAcc.usage.dailySentCount || 0) : 0;
        const limit = isPro ? 2000 : 5;
        return {
          isPro,
          sentToday,
          limit,
          remaining: Math.max(0, limit - sentToday),
          plan: dbAcc.subscription ? dbAcc.subscription.plan : 'free',
          status: dbAcc.subscription ? dbAcc.subscription.status : 'trial'
        };
      }
    } catch (e) {}
  }

  const localAcc = getAccount(cleanEmail);
  const isPro = localAcc && localAcc.subscription && localAcc.subscription.plan === 'starter_1_99' && localAcc.subscription.status === 'active';
  const sentToday = (localAcc && localAcc.usage && localAcc.usage.lastSentDate === todayStr) ? (localAcc.usage.dailySentCount || 0) : 0;
  const limit = isPro ? 2000 : 5;
  return {
    isPro,
    sentToday,
    limit,
    remaining: Math.max(0, limit - sentToday),
    plan: localAcc && localAcc.subscription ? localAcc.subscription.plan : 'free',
    status: localAcc && localAcc.subscription ? localAcc.subscription.status : 'trial'
  };
}

/**
 * Increment daily sent count in both MongoDB and local accounts.json
 */
async function incrementDailySent(email) {
  const cleanEmail = (email || '').toLowerCase().trim();
  const todayStr = new Date().toISOString().split('T')[0];

  // 1. Update local accounts.json
  const accounts = loadAccounts();
  const acc = accounts.find(a => a.email.toLowerCase() === cleanEmail);
  if (acc) {
    if (!acc.usage || acc.usage.lastSentDate !== todayStr) {
      acc.usage = {
        dailySentCount: 0,
        lastSentDate: todayStr,
        dailyLimit: acc.subscription && acc.subscription.plan === 'starter_1_99' ? 2000 : 5,
        totalSentAllTime: (acc.usage && acc.usage.totalSentAllTime) || 0
      };
    }
    acc.usage.dailySentCount = (acc.usage.dailySentCount || 0) + 1;
    acc.usage.totalSentAllTime = (acc.usage.totalSentAllTime || 0) + 1;
    saveAccounts(accounts);
  }

  // 2. Update MongoDB
  if (getIsConnected()) {
    try {
      const dbAcc = await Account.findOne({ email: cleanEmail });
      if (dbAcc) {
        if (!dbAcc.usage || dbAcc.usage.lastSentDate !== todayStr) {
          dbAcc.usage = {
            dailySentCount: 1,
            lastSentDate: todayStr,
            dailyLimit: dbAcc.subscription && dbAcc.subscription.plan === 'starter_1_99' ? 2000 : 5,
            totalSentAllTime: (dbAcc.usage ? dbAcc.usage.totalSentAllTime : 0) + 1
          };
        } else {
          dbAcc.usage.dailySentCount = (dbAcc.usage.dailySentCount || 0) + 1;
          dbAcc.usage.totalSentAllTime = (dbAcc.usage.totalSentAllTime || 0) + 1;
        }
        await dbAcc.save();
      }
    } catch (err) {
      console.warn('[TokenService] DB increment usage error:', err.message);
    }
  }
}

module.exports = {
  checkAccountLimit,
  saveAccount,
  saveManualAccount,
  listAccounts,
  getAccount,
  deleteAccount,
  getAuthenticatedClient,
  getDailyUsage,
  incrementDailySent
};
