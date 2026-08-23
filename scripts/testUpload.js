const http = require('http');
const express = require('express');
const uploadRoutes = require('../routes/uploadRoutes');
const { saveAccount } = require('../services/tokenService');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use('/api/upload', uploadRoutes);

async function testUploadEndpoint() {
  console.log('--- Testing /api/upload Route ---');

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  console.log('Test server listening on port', port);

  try {
    // 1. Test upload free user
    const freeEmail = 'free_uploader_' + Date.now() + '@example.com';
    await saveAccount({ email: freeEmail, name: 'Free User' }, { access_token: '123' });

    // Send multipart form data
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    let body = `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="uploaderEmail"\r\n\r\n${freeEmail}\r\n`;
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="file"; filename="sample.pdf"\r\n`;
    body += `Content-Type: application/pdf\r\n\r\n`;
    body += `%PDF-1.4 test dummy pdf content\r\n`;
    body += `--${boundary}--\r\n`;

    const freeRes = await fetch(`http://127.0.0.1:${port}/api/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body
    });

    const freeData = await freeRes.json();
    console.log('Free User Upload Response Status:', freeRes.status, freeData);

    if (freeRes.status !== 403 || !freeData.upgradeRequired) {
      throw new Error('Expected 403 upgradeRequired for free user upload');
    }
    console.log('✓ Free user upload blocked as expected (403)');

    // 2. Test Pro user upload check
    const proEmail = 'pro_uploader_' + Date.now() + '@example.com';
    await saveAccount({ email: proEmail, name: 'Pro User' }, { access_token: '123' });

    const ACCOUNTS_FILE = path.join(__dirname, '../data/accounts.json');
    if (fs.existsSync(ACCOUNTS_FILE)) {
      const raw = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
      const accs = JSON.parse(raw);
      const acc = accs.find(a => a.email.toLowerCase() === proEmail.toLowerCase());
      if (acc) {
        acc.subscription = { plan: 'starter_2_99', status: 'active', accountLimit: 1 };
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accs, null, 2), 'utf8');
      }
    }

    // Pro user no-file request
    let proBody = `--${boundary}\r\n`;
    proBody += `Content-Disposition: form-data; name="uploaderEmail"\r\n\r\n${proEmail}\r\n`;
    proBody += `--${boundary}--\r\n`;

    const proNoFileRes = await fetch(`http://127.0.0.1:${port}/api/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body: proBody
    });

    const proNoFileData = await proNoFileRes.json();
    console.log('Pro User No-File Response:', proNoFileRes.status, proNoFileData);

    if (proNoFileRes.status !== 400 || proNoFileData.success !== false) {
      throw new Error('Expected 400 for no file provided');
    }

    console.log('✓ Pro user file validation passed (400 when missing file)');
    console.log('🎉 Upload endpoint tests passed successfully with 0 errors!');
  } finally {
    server.close();
  }
}

testUploadEndpoint().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
