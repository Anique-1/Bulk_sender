const nodemailer = require('nodemailer');

/**
 * Creates Nodemailer transporter for Gmail, Google Workspace, or Custom Business SMTP
 */
function createTransporter(options) {
  const { host, port, secure, user, pass } = typeof options === 'string' 
    ? { user: arguments[0], pass: arguments[1] } 
    : options;

  const smtpHost = host ? host.trim() : 'smtp.gmail.com';
  const smtpPort = port ? parseInt(port, 10) : 465;
  const isSecure = secure !== undefined ? Boolean(secure) : (smtpPort === 465);

  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: isSecure,
    auth: {
      user: user ? user.trim() : '',
      pass: pass ? pass.replace(/\s+/g, '').trim() : ''
    },
    tls: {
      rejectUnauthorized: false
    }
  });
}

/**
 * Verifies if user & password/SMTP credentials are valid
 */
async function verifySmtpCredentials(options) {
  const transporter = createTransporter(options);
  await transporter.verify();
  return true;
}

/**
 * Sends email via SMTP (Gmail, Workspace, or Custom Business server) with attachment support
 */
async function sendSmtpEmail({ fromName, fromEmail, pass, host, port, secure, toEmail, subject, htmlBody, textBody, attachments = [] }) {
  const transporter = createTransporter({
    host,
    port,
    secure,
    user: fromEmail,
    pass
  });

  const senderHeader = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;

  const mailAttachments = (attachments || []).map(att => {
    if (att.buffer) {
      return {
        filename: att.filename || 'attachment.pdf',
        content: att.buffer
      };
    }
    return {
      filename: att.filename || att.name || 'attachment.pdf',
      path: att.url || att.secureUrl || att.path
    };
  });

  const mailOptions = {
    from: senderHeader,
    to: toEmail,
    subject: subject,
    text: textBody || htmlBody.replace(/<[^>]*>?/gm, ''),
    html: htmlBody,
    attachments: mailAttachments.length > 0 ? mailAttachments : undefined
  };

  const info = await transporter.sendMail(mailOptions);
  return info;
}

module.exports = {
  createTransporter,
  verifySmtpCredentials,
  sendSmtpEmail
};
