const { cloudinary, isCloudinaryConfigured } = require('../config/cloudinary');
const Attachment = require('../models/Attachment');
const { getIsConnected } = require('../config/db');

/**
 * Upload a file buffer (PDF, image, document) to Cloudinary
 */
async function uploadToCloudinary({ buffer, originalname, mimetype, uploaderEmail = '' }) {
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary is not configured. Please add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in backend/.env');
  }

  const isPdf = mimetype === 'application/pdf' || originalname.toLowerCase().endsWith('.pdf');
  const isImage = mimetype.startsWith('image/');
  const resourceType = isPdf ? 'raw' : (isImage ? 'image' : 'auto');

  // Sanitize filename for Cloudinary public_id
  const cleanBaseName = originalname
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  const publicId = `bulk_gmail_${Date.now()}_${cleanBaseName}`;

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: resourceType,
        public_id: publicId,
        folder: 'bulk_gmail_sender',
        use_filename: true,
        unique_filename: true
      },
      async (error, result) => {
        if (error) {
          console.error('[Cloudinary] Upload error:', error);
          return reject(error);
        }

        const fileData = {
          publicId: result.public_id,
          url: result.url,
          secureUrl: result.secure_url,
          filename: originalname,
          format: result.format || (isPdf ? 'pdf' : 'unknown'),
          resourceType: result.resource_type || resourceType,
          bytes: result.bytes,
          uploaderEmail: uploaderEmail || 'anonymous'
        };

        // Save to MongoDB if connected
        if (getIsConnected()) {
          try {
            const saved = await Attachment.create(fileData);
            fileData.id = saved._id;
          } catch (dbErr) {
            console.warn('[Cloudinary] Could not save to DB:', dbErr.message);
          }
        }

        resolve(fileData);
      }
    );

    uploadStream.end(buffer);
  });
}

/**
 * Delete a file from Cloudinary
 */
async function deleteFromCloudinary(publicId, resourceType = 'image') {
  if (!isCloudinaryConfigured()) return false;

  try {
    const res = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    if (getIsConnected()) {
      await Attachment.deleteOne({ publicId });
    }
    return res.result === 'ok';
  } catch (err) {
    console.error('[Cloudinary] Delete error:', err);
    return false;
  }
}

/**
 * List recent uploaded files
 */
async function listRecentFiles(uploaderEmail) {
  if (getIsConnected()) {
    try {
      const query = uploaderEmail ? { uploaderEmail } : {};
      return await Attachment.find(query).sort({ createdAt: -1 }).limit(20).lean();
    } catch (err) {
      console.warn('[Cloudinary] DB list failed:', err.message);
    }
  }
  return [];
}

module.exports = {
  uploadToCloudinary,
  deleteFromCloudinary,
  listRecentFiles
};
