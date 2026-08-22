require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB, getIsConnected } = require('./config/db');
const { isCloudinaryConfigured } = require('./config/cloudinary');

const authRoutes = require('./routes/authRoutes');
const campaignRoutes = require('./routes/campaignRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const legalRoutes = require('./routes/legalRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// Enable CORS for all Chrome Extension origins & localhost
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-signature', 'x-profile-id']
}));

app.use(express.json({ 
  limit: '25mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// Legal Pages (for Chrome Web Store & Google OAuth Verification)
app.use('/', legalRoutes);
app.use('/api', legalRoutes);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/campaign', campaignRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/subscription', subscriptionRoutes);

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Bulk Gmail Sender Backend',
    version: '2.0.0',
    database: {
      connected: getIsConnected(),
      type: getIsConnected() ? 'MongoDB Atlas' : 'Local JSON Fallback'
    },
    cloudinary: {
      configured: isCloudinaryConfigured()
    },
    subscription: {
      lemonSqueezyReady: Boolean(process.env.LEMONSQUEEZY_CHECKOUT_URL || process.env.LEMONSQUEEZY_WEBHOOK_SECRET),
      defaultPlan: 'Starter Pro ($1.99/mo)'
    },
    endpoints: {
      authUrl: '/api/auth/google/url',
      accounts: '/api/auth/accounts',
      upload: '/api/upload',
      plans: '/api/subscription/plans',
      subscriptionStatus: '/api/subscription/status/:email',
      startCampaign: '/api/campaign/start',
      streamCampaign: '/api/campaign/stream/:jobId',
      campaignHistory: '/api/campaign/history'
    }
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err);
  res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`🚀 Bulk Gmail Sender Server running on port ${PORT}`);
    console.log(`👉 Health Check: http://localhost:${PORT}/`);
    console.log(`👉 MongoDB: ${getIsConnected() ? 'Connected' : 'JSON Fallback'}`);
    console.log(`👉 Cloudinary: ${isCloudinaryConfigured() ? 'Ready' : 'Pending Env Credentials'}`);
    console.log(`👉 Checkout: https://replyeo.lemonsqueezy.com/checkout/buy/f0ec5261-ef37-41a3-89ad-7acabe2d99ce`);
    console.log(`===============================================`);
  });
}

module.exports = app;
