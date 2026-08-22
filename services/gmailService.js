const axios = require('axios');
const { getAccount, getAuthenticatedClient } = require('./tokenService');
const { sendSmtpEmail } = require('./mailerService');

/**
 * Encodes a string or buffer to base64url format for Gmail API
 */
function base64UrlEncode(bufferOrStr) {
  const buf = Buffer.isBuffer(bufferOrStr) ? bufferOrStr : Buffer.from(bufferOrStr, 'utf8');
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Helper to fetch attachment buffer from Cloudinary or remote URL
 */
async function fetchAttachmentBuffer(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
    return Buffer.from(response.data);
  } catch (err) {
    console.error(`[GmailService] Failed to download attachment from ${url}:`, err.message);
    return null;
  }
}

/**
 * Creates RFC 2822 raw email MIME string with full attachment support (PDF, Images, etc.)
 */
async function createRawEmail({ from, to, subject, htmlBody, textBody, attachments = [] }) {
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;

  // Case 1: Simple email without attachments
  if (!attachments || attachments.length === 0) {
    const boundary = `====_NextPart_${Date.now().toString(16)}====`;
    const lines = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${encodedSubject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      textBody || htmlBody.replace(/<[^>]*>?/gm, ''),
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      htmlBody,
      '',
      `--${boundary}--`
    ];
    return lines.join('\r\n');
  }

  // Case 2: Multipart/Mixed email with attachments
  const mixedBoundary = `====_MixedPart_${Date.now().toString(16)}====`;
  const altBoundary = `====_AltPart_${Date.now().toString(16)}====`;

  let mimeParts = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    '',
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    '',
    `--${altBoundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    textBody || htmlBody.replace(/<[^>]*>?/gm, ''),
    '',
    `--${altBoundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    htmlBody,
    '',
    `--${altBoundary}--`
  ];

  // Process attachments
  for (const att of attachments) {
    const fileUrl = att.url || att.secureUrl || att.path;
    const filename = att.filename || att.name || 'attachment.pdf';
    let fileBuffer = att.buffer;

    if (!fileBuffer && fileUrl) {
      fileBuffer = await fetchAttachmentBuffer(fileUrl);
    }

    if (fileBuffer) {
      const isPdf = filename.toLowerCase().endsWith('.pdf');
      const isPng = filename.toLowerCase().endsWith('.png');
      const isJpg = filename.toLowerCase().endsWith('.jpg') || filename.toLowerCase().endsWith('.jpeg');
      let contentType = 'application/octet-stream';
      if (isPdf) contentType = 'application/pdf';
      else if (isPng) contentType = 'image/png';
      else if (isJpg) contentType = 'image/jpeg';

      const base64Data = fileBuffer.toString('base64');

      mimeParts.push(
        '',
        `--${mixedBoundary}`,
        `Content-Type: ${contentType}; name="${filename}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${filename}"`,
        '',
        base64Data
      );
    }
  }

  mimeParts.push('', `--${mixedBoundary}--`);
  return mimeParts.join('\r\n');
}

/**
 * Unified dispatch function: automatically supports BOTH OAuth accounts & Manual App Password accounts
 */
async function sendGmailMessage({ fromEmail, toEmail, subject, htmlBody, textBody, attachments = [], profileId }) {
  const account = getAccount(fromEmail, profileId);

  if (!account) {
    throw new Error(`Sender account ${fromEmail} is not configured.`);
  }

  // Path A: Manual Business Gmail (App Password / SMTP)
  if (account.type === 'smtp' || account.smtp) {
    return await sendSmtpEmail({
      fromName: account.name,
      fromEmail: account.email,
      pass: account.smtp.pass,
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      toEmail,
      subject,
      htmlBody,
      textBody,
      attachments
    });
  }

  // Path B: Google OAuth 2.0 (Gmail REST API)
  const auth = await getAuthenticatedClient(fromEmail, profileId);
  const rawMime = await createRawEmail({
    from: fromEmail,
    to: toEmail,
    subject,
    htmlBody,
    textBody,
    attachments
  });

  const encodedMessage = base64UrlEncode(rawMime);

  const response = await auth.request({
    url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    method: 'POST',
    data: {
      raw: encodedMessage
    }
  });

  return response.data;
}

module.exports = {
  sendGmailMessage
};
