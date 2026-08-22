const express = require('express');
const router = express.Router();

const PRIVACY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy - SendEO</title>
  <style>
    :root {
      --primary: #10b981;
      --bg: #0f172a;
      --card-bg: #1e293b;
      --text: #e2e8f0;
      --text-muted: #94a3b8;
      --border: rgba(255, 255, 255, 0.1);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.7;
      padding: 40px 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 40px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    }
    .header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 24px;
      margin-bottom: 30px;
    }
    .brand-badge {
      display: inline-block;
      background: rgba(16, 185, 129, 0.15);
      color: var(--primary);
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 12px;
    }
    h1 {
      font-size: 2rem;
      color: #fff;
      margin-bottom: 8px;
    }
    .updated {
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    h2 {
      font-size: 1.25rem;
      color: #fff;
      margin-top: 28px;
      margin-bottom: 12px;
      border-left: 3px solid var(--primary);
      padding-left: 10px;
    }
    p, ul {
      margin-bottom: 16px;
      color: var(--text);
      font-size: 0.95rem;
    }
    ul {
      padding-left: 20px;
    }
    li {
      margin-bottom: 8px;
    }
    .highlight-box {
      background: rgba(16, 185, 129, 0.08);
      border: 1px solid rgba(16, 185, 129, 0.25);
      border-radius: 10px;
      padding: 16px 20px;
      margin: 20px 0;
    }
    .highlight-box h3 {
      color: var(--primary);
      font-size: 1rem;
      margin-bottom: 8px;
    }
    a {
      color: var(--primary);
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    .footer {
      border-top: 1px solid var(--border);
      margin-top: 40px;
      padding-top: 20px;
      font-size: 0.85rem;
      color: var(--text-muted);
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="brand-badge">Official Policy</span>
      <h1>Privacy Policy for SendEO</h1>
      <p class="updated">Product: <strong>SendEO</strong> | Last Updated: August 2026</p>
    </div>

    <p>Welcome to <strong>SendEO</strong>, a productivity tool and Google Chrome extension. We respect your privacy and are committed to protecting your personal information and Google user data.</p>

    <h2>1. Information We Collect</h2>
    <p>When you use SendEO, we may process the following information solely to provide core sending capabilities:</p>
    <ul>
      <li><strong>Google Account Information:</strong> Your authorized email address, display name, and OAuth 2.0 access/refresh tokens obtained when you connect your Google account.</li>
      <li><strong>Email Content & Templates:</strong> Email subject lines, recipient lists (CSV uploads or manual input), message bodies, and attachments that you draft to send.</li>
      <li><strong>Usage & Subscription Data:</strong> Daily email dispatch counts to enforce plan quotas and subscription status linked with payment providers (e.g. Lemon Squeezy).</li>
    </ul>

    <h2>2. How We Use Your Information</h2>
    <p>We process your data strictly to execute the functionality you request:</p>
    <ul>
      <li>To authenticate and connect your authorized Gmail account via secure OAuth 2.0.</li>
      <li>To transmit and dispatch your personalized email campaigns through your connected Gmail account using the official Gmail API (<code>https://www.googleapis.com/auth/gmail.send</code>).</li>
      <li>To generate campaign delivery reports and real-time dispatch progress logs for your review.</li>
    </ul>

    <div class="highlight-box">
      <h3>🔒 Google API Limited Use Disclosure</h3>
      <p>SendEO's use and transfer to any other app of information received from Google APIs will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
      <p>We <strong>DO NOT</strong> read your inbox emails, sell your data, use your email contents for advertising, or train artificial intelligence/machine learning models on your private messages.</p>
    </div>

    <h2>3. Data Storage & Security</h2>
    <p>Your security is our top priority:</p>
    <ul>
      <li>OAuth credentials and tokens are encrypted and transmitted over secure HTTPS/TLS protocols.</li>
      <li>Campaign recipient lists and draft templates are only processed for the active campaign and are not shared with any third-party advertisers.</li>
      <li>Attachments are temporarily hosted securely via Cloudinary for delivery purposes and can be deleted upon request.</li>
    </ul>

    <h2>4. Data Sharing & Third-Party Services</h2>
    <p>We only interact with trusted infrastructure providers required to operate the service:</p>
    <ul>
      <li><strong>Google APIs:</strong> For OAuth authentication and sending emails.</li>
      <li><strong>Lemon Squeezy:</strong> For processing subscription payments securely without storing your credit card data on our servers.</li>
      <li><strong>MongoDB / Cloudinary:</strong> For secure database persistence and media hosting.</li>
    </ul>

    <h2>5. Data Retention and Account Deletion</h2>
    <p>You can revoke SendEO's access to your Google account at any time via your <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">Google Account Permissions Settings</a> or by disconnecting your account inside the extension. Upon disconnection, your OAuth tokens are immediately invalidated.</p>

    <h2>6. Contact Us</h2>
    <p>If you have any questions or concerns regarding this Privacy Policy or wish to request data deletion, please contact:</p>

    <div class="footer">
      &copy; 2026 Bulk Gmail Sender Extension. All rights reserved. Bulk Gmail Sender is not affiliated with Google Inc.
    </div>
  </div>
</body>
</html>`;

const TERMS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Terms of Service - SendEO</title>
  <style>
    :root {
      --primary: #10b981;
      --bg: #0f172a;
      --card-bg: #1e293b;
      --text: #e2e8f0;
      --text-muted: #94a3b8;
      --border: rgba(255, 255, 255, 0.1);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.7;
      padding: 40px 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 40px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    }
    .header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 24px;
      margin-bottom: 30px;
    }
    .brand-badge {
      display: inline-block;
      background: rgba(16, 185, 129, 0.15);
      color: var(--primary);
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 12px;
    }
    h1 {
      font-size: 2rem;
      color: #fff;
      margin-bottom: 8px;
    }
    .updated {
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    h2 {
      font-size: 1.25rem;
      color: #fff;
      margin-top: 28px;
      margin-bottom: 12px;
      border-left: 3px solid var(--primary);
      padding-left: 10px;
    }
    p, ul {
      margin-bottom: 16px;
      color: var(--text);
      font-size: 0.95rem;
    }
    ul { padding-left: 20px; }
    li { margin-bottom: 8px; }
    a { color: var(--primary); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .footer {
      border-top: 1px solid var(--border);
      margin-top: 40px;
      padding-top: 20px;
      font-size: 0.85rem;
      color: var(--text-muted);
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="brand-badge">Terms & Conditions</span>
      <h1>Terms of Service</h1>
      <p class="updated">Product: <strong>Bulk Gmail Sender Extension</strong> | Last Updated: August 2026</p>
    </div>

    <p>By installing, connecting, or using <strong>Bulk Gmail Sender Extension</strong>, you agree to comply with these Terms of Service.</p>

    <h2>1. Acceptable Use & Anti-Spam Policy</h2>
    <p>Users must comply with all applicable email marketing laws (including CAN-SPAM Act and GDPR) and Google's Acceptable Use Policies. You agree not to use this software to send unsolicited spam, illegal content, phishing schemes, or malicious attachments.</p>

    <h2>2. Google Account Responsibility</h2>
    <p>You acknowledge that you are using your own connected Gmail account to dispatch emails. You are responsible for maintaining good sender reputation and abiding by Gmail's daily sending limits.</p>

    <h2>3. Subscriptions & Payments</h2>
    <p>Paid tiers (such as Starter Plan at $1.99/mo) are managed via Lemon Squeezy. Subscriptions can be canceled at any time from your customer billing portal.</p>

    <h2>4. Disclaimer & Limitation of Liability</h2>
    <p>The software is provided "as is" without warranty of any kind. Bulk Gmail Sender Extension shall not be liable for account suspensions or deliverability issues resulting from violation of email provider guidelines.</p>

    <h2>5. Contact Information</h2>
    <p>For support or questions regarding these terms, please contact:<br>
    Email: <a href="mailto:muhammadanique81@gmail.com">muhammadanique81@gmail.com</a><br>
    Website: <a href="https://app.replyeo.com" target="_blank" rel="noopener noreferrer">https://app.replyeo.com</a></p>

    <div class="footer">
      &copy; 2026 Bulk Gmail Sender Extension. All rights reserved.
    </div>
  </div>
</body>
</html>`;

// GET /privacy
router.get('/privacy', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(PRIVACY_HTML);
});

// GET /terms
router.get('/terms', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(TERMS_HTML);
});

module.exports = router;
