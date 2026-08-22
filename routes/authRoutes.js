const express = require('express');
const router = express.Router();
const { getOAuth2Client, SCOPES } = require('../config/googleAuth');
const { saveAccount, saveManualAccount, listAccounts, deleteAccount } = require('../services/tokenService');
const { verifySmtpCredentials } = require('../services/mailerService');

/**
 * POST /api/auth/manual
 * Verifies & saves a manual business Gmail account using an App Password
 */
router.post('/manual', async (req, res) => {
  const { email, name, appPassword, host, port } = req.body;
  const profileId = req.headers['x-profile-id'] || null;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ success: false, error: 'Valid email address is required' });
  }

  if (!appPassword || appPassword.trim().length < 4) {
    return res.status(400).json({ success: false, error: 'Password or App Password is required' });
  }

  try {
    // 1. Verify SMTP credentials with SMTP server (default smtp.gmail.com:465)
    await verifySmtpCredentials({
      host: host || 'smtp.gmail.com',
      port: port ? parseInt(port, 10) : 465,
      user: email,
      pass: appPassword
    });

    // 2. Save account in local store, scoped to this Chrome profile
    const account = await saveManualAccount({
      email,
      name,
      appPassword,
      host,
      port,
      profileId
    });

    res.json({
      success: true,
      message: `Business Gmail ${email} connected successfully!`,
      account: {
        id: account.id,
        type: account.type,
        email: account.email,
        name: account.name,
        connectedAt: account.connectedAt
      }
    });
  } catch (err) {
    console.error('Error verifying manual Gmail account:', err.message);
    res.status(400).json({
      success: false,
      error: `Authentication failed: ${err.message}. Please verify your Gmail address and 16-character App Password.`
    });
  }
});

/**
 * GET /api/auth/google
 * Direct redirect endpoint to Google OAuth consent screen
 */
router.get('/google', (req, res) => {
  const profileId = req.query.profileId || req.headers['x-profile-id'] || null;
  try {
    const oauth2Client = getOAuth2Client();
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
      state: profileId ? Buffer.from(JSON.stringify({ profileId })).toString('base64') : undefined
    });
    res.redirect(authUrl);
  } catch (err) {
    console.error('Error initiating Google OAuth redirect:', err);
    res.status(500).send(`Error starting Google OAuth: ${err.message}`);
  }
});

/**
 * GET /api/auth/google/url
 * Returns the Google OAuth authorization URL
 * Embeds the profileId in the OAuth state param so the callback can scope the account.
 */
router.get('/google/url', (req, res) => {
  const profileId = req.query.profileId || req.headers['x-profile-id'] || null;
  try {
    const oauth2Client = getOAuth2Client();
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Required to get refresh_token
      prompt: 'consent',     // Forces consent screen to ensure refresh token is issued
      scope: SCOPES,
      state: profileId ? Buffer.from(JSON.stringify({ profileId })).toString('base64') : undefined
    });

    res.json({ success: true, authUrl });
  } catch (err) {
    console.error('Error generating auth URL:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/auth/google/callback
 * Handles OAuth2 callback from Google, retrieves tokens & profile
 */
router.get('/google/callback', async (req, res) => {
  const { code, error, state: stateParam } = req.query;

  // Decode profileId from state param (set during /google/url)
  let profileId = null;
  if (stateParam) {
    try {
      const decoded = JSON.parse(Buffer.from(stateParam, 'base64').toString());
      profileId = decoded.profileId || null;
    } catch (e) {
      console.warn('[OAuth Callback] Could not decode state param:', e.message);
    }
  }

  if (error) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication Failed</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #1e293b; padding: 2.5rem; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); text-align: center; max-width: 400px; }
          h2 { color: #f87171; margin-bottom: 0.5rem; }
          p { color: #94a3b8; font-size: 0.95rem; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Authentication Cancelled</h2>
          <p>You did not approve the required permissions. You can close this window and try again.</p>
        </div>
      </body>
      </html>
    `);
  }

  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Fetch user profile info directly
    const userRes = await oauth2Client.request({
      url: 'https://www.googleapis.com/oauth2/v2/userinfo'
    });
    const profile = userRes.data;

    // Save account & tokens scoped to the profileId
    await saveAccount(profile, tokens, profileId);
    console.log(`[OAuth] Account saved: ${profile.email} (profileId: ${profileId || 'global'})`);

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Gmail Connected Successfully</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #090d16;
            color: #f8fafc;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
          }
          .card {
            background: rgba(30, 41, 59, 0.7);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            padding: 3rem 2.5rem;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
            text-align: center;
            max-width: 420px;
          }
          .avatar {
            width: 72px;
            height: 72px;
            border-radius: 50%;
            border: 3px solid #38bdf8;
            margin-bottom: 1.25rem;
            object-fit: cover;
          }
          h2 {
            margin: 0 0 0.5rem 0;
            font-size: 1.5rem;
            background: linear-gradient(135deg, #38bdf8, #818cf8);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }
          .email {
            font-size: 1.05rem;
            font-weight: 600;
            color: #e2e8f0;
            margin-bottom: 1.5rem;
          }
          .badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: rgba(34, 197, 94, 0.15);
            color: #4ade80;
            padding: 6px 14px;
            border-radius: 9999px;
            font-size: 0.85rem;
            font-weight: 500;
            margin-bottom: 1.5rem;
          }
          p {
            color: #94a3b8;
            font-size: 0.9rem;
            line-height: 1.5;
            margin: 0;
          }
        </style>
      </head>
      <body>
        <div class="card">
          ${profile.picture ? `<img src="${profile.picture}" class="avatar" alt="Avatar" />` : ''}
          <h2>Account Connected!</h2>
          <div class="email">${profile.email}</div>
          <div class="badge">✓ Ready for Bulk Sending</div>
          <p>Your Gmail account is now securely linked. You can close this tab and return to the Chrome Extension.</p>
        </div>
        <script>
          setTimeout(() => {
            if (window.opener) {
              window.close();
            }
          }, 3500);
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Error exchanging OAuth token:', err);
    res.status(500).send(`<h3>Authentication Error</h3><p>${err.message}</p>`);
  }
});

/**
 * GET /api/auth/accounts
 * Returns ONLY the accounts belonging to this Chrome profile (x-profile-id header)
 */
router.get('/accounts', (req, res) => {
  const profileId = req.headers['x-profile-id'] || null;
  try {
    const accounts = listAccounts(profileId);
    res.json({ success: true, accounts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/auth/accounts/:email
 * Disconnect an account (scoped to this Chrome profile)
 */
router.delete('/accounts/:email', async (req, res) => {
  const profileId = req.headers['x-profile-id'] || null;
  try {
    const removed = await deleteAccount(req.params.email, profileId);
    res.json({ success: true, removed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
