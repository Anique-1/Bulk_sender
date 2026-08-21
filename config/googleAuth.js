require('dotenv').config();
const { OAuth2Client } = require('google-auth-library');

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/auth/google/callback';

  if (!clientId || !clientSecret || clientId.includes('YOUR_GOOGLE_CLIENT_ID')) {
    console.warn('[GoogleAuth] Warning: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not configured in .env');
  }

  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

// Scopes required for bulk sending and identifying sender account
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'openid'
];

module.exports = {
  getOAuth2Client,
  SCOPES
};
