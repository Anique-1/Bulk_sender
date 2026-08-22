const express = require('express');
const router = express.Router();
const multer = require('multer');
const { uploadToCloudinary, deleteFromCloudinary, listRecentFiles } = require('../services/cloudinaryService');
const { isCloudinaryConfigured } = require('../config/cloudinary');
const { getAccount } = require('../services/tokenService');
const Account = require('../models/Account');
const CHECKOUT_URL = process.env.GUMROAD_CHECKOUT_URL || 'https://muhammadanique.gumroad.com/l/wlgzrc?wanted=true';

// Multer memory storage (works seamlessly in serverless and standard Node)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25 MB max file size
});

/**
 * GET /api/upload/status
 * Check if Cloudinary is configured
 */
router.get('/status', (req, res) => {
  res.json({
    success: true,
    configured: isCloudinaryConfigured(),
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || null
  });
});

/**
 * POST /api/upload
 * Upload PDF, Image, or Document to Cloudinary (Exclusive to $1.99 Starter Plan)
 */
router.post('/', upload.single('file'), async (req, res) => {
  const uploaderEmail = (req.body.uploaderEmail || '').toLowerCase().trim();

  // Check Plan Permissions: Free plan cannot upload PDF/attachments
  let isPro = false;
  if (uploaderEmail) {
    if (getIsConnected()) {
      try {
        const dbAcc = await Account.findOne({ email: uploaderEmail });
        if (dbAcc && dbAcc.subscription && (dbAcc.subscription.plan === 'starter_1_99' || dbAcc.subscription.plan === 'pro') && dbAcc.subscription.status === 'active') {
          isPro = true;
        }
      } catch (e) { }
    }

    if (!isPro) {
      const localAcc = getAccount(uploaderEmail);
      if (localAcc && localAcc.subscription && localAcc.subscription.plan === 'starter_1_99' && localAcc.subscription.status === 'active') {
        isPro = true;
      }
    }
  }

  if (!isPro) {
    const prefilledCheckoutUrl = `${CHECKOUT_URL}?checkout[email]=${encodeURIComponent(uploaderEmail)}`;
    return res.status(403).json({
      success: false,
      upgradeRequired: true,
      error: '📄 PDF and file attachments are exclusive to the Starter Plan ($1.99/mo). Please upgrade your account to send attachments.',
      checkoutUrl: prefilledCheckoutUrl
    });
  }

  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file provided' });
  }

  try {
    const uploadedFile = await uploadToCloudinary({
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      uploaderEmail
    });

    res.json({
      success: true,
      file: uploadedFile,
      message: 'File uploaded to Cloudinary successfully'
    });
  } catch (err) {
    console.error('Error uploading file to Cloudinary:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to upload file to Cloudinary'
    });
  }
});

/**
 * GET /api/upload/list
 * List recent uploaded files
 */
router.get('/list', async (req, res) => {
  try {
    const files = await listRecentFiles(req.query.email);
    res.json({ success: true, files });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/upload/:publicId
 * Delete a file
 */
router.delete('/:publicId', async (req, res) => {
  try {
    const { resourceType } = req.query;
    const removed = await deleteFromCloudinary(req.params.publicId, resourceType || 'image');
    res.json({ success: true, removed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
