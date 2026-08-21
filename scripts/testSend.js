require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sendGmailMessage } = require('../services/gmailService');
const { listAccounts } = require('../services/tokenService');
const { connectDB } = require('../config/db');

async function test() {
  await connectDB();
  const accounts = listAccounts();
  console.log('Connected accounts:', accounts);

  if (accounts.length === 0) {
    console.log('No accounts found.');
    process.exit(0);
  }

  const sender = accounts[0].email;
  console.log(`Attempting test send from: ${sender}`);

  try {
    const res = await sendGmailMessage({
      fromEmail: sender,
      toEmail: sender, // Send to self
      subject: 'Test Email from Bulk Sender',
      htmlBody: '<p>This is a test message to verify the dispatch pipeline.</p>',
      textBody: 'This is a test message to verify the dispatch pipeline.'
    });
    console.log('✅ Send success:', res);
  } catch (err) {
    console.error('❌ Send failed:', err);
  }

  process.exit(0);
}

test();
