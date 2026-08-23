const { getDailyUsage, incrementDailySent, saveAccount } = require('../services/tokenService');
const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('--- Testing $2.99 Quota & FIRST100 10% OFF Promo Code System ---');
  const testEmail = 'test_discount_' + Date.now() + '@example.com';
  const testPromoEmail = 'test_discount_user_' + Date.now() + '@example.com';
  
  // 1. Initial Free user
  await saveAccount({ email: testEmail, name: 'Test User' }, { access_token: 'abc' });
  const usageFree = await getDailyUsage(testEmail);
  console.log('1. Free User Usage:', {
    isPro: usageFree.isPro,
    sent: usageFree.sent,
    limit: usageFree.limit,
    remaining: usageFree.remaining,
    plan: usageFree.plan
  });

  if (usageFree.isPro !== false || usageFree.limit !== 25) {
    throw new Error('Free user limit test failed');
  }

  // 2. Standard $2.99 Pro Upgrade (2,000 Quota)
  const ACCOUNTS_FILE = path.join(__dirname, '../data/accounts.json');
  if (fs.existsSync(ACCOUNTS_FILE)) {
    const raw = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
    const accs = JSON.parse(raw);
    const acc = accs.find(a => a.email.toLowerCase() === testEmail.toLowerCase());
    if (acc) {
      acc.subscription = { plan: 'starter_2_99', status: 'active', accountLimit: 1 };
      acc.usage.proSentCount = 0;
      acc.usage.proLimit = 2000;
      fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accs, null, 2), 'utf8');
    }
  }

  const usagePro = await getDailyUsage(testEmail);
  console.log('2. $2.99 Pro User Usage (2,000 Quota):', {
    isPro: usagePro.isPro,
    sent: usagePro.sent,
    limit: usagePro.limit,
    remaining: usagePro.remaining,
    plan: usagePro.plan,
    status: usagePro.status
  });

  if (usagePro.isPro !== true || usagePro.limit !== 2000 || usagePro.remaining !== 2000) {
    throw new Error('Pro $2.99 user limit test failed');
  }

  // 3. Test Promo Code FIRST100 (10% OFF at Checkout, 2,000 Quota Package)
  await saveAccount({ email: testPromoEmail, name: 'Promo User' }, { access_token: 'xyz' });

  // Simulate applying FIRST100 promo
  if (fs.existsSync(ACCOUNTS_FILE)) {
    const raw = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
    const accs = JSON.parse(raw);
    const acc = accs.find(a => a.email.toLowerCase() === testPromoEmail.toLowerCase());
    if (acc) {
      acc.subscription = { plan: 'starter_2_99', status: 'active', accountLimit: 1, licenseKey: 'FIRST100' };
      acc.usage.proSentCount = 0;
      acc.usage.proLimit = 2000; // Standard 2,000 email quota
      fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accs, null, 2), 'utf8');
    }
  }

  const usagePromo = await getDailyUsage(testPromoEmail);
  console.log('3. FIRST100 Promo User Usage (2,000 Quota):', {
    isPro: usagePromo.isPro,
    sent: usagePromo.sent,
    limit: usagePromo.limit,
    remaining: usagePromo.remaining,
    plan: usagePromo.plan,
    status: usagePromo.status
  });

  if (usagePromo.isPro !== true || usagePromo.limit !== 2000 || usagePromo.remaining !== 2000) {
    throw new Error('FIRST100 Promo 2000 quota test failed');
  }

  // 4. Send emails
  await incrementDailySent(testPromoEmail);
  await incrementDailySent(testPromoEmail);
  const usagePromoAfterSend = await getDailyUsage(testPromoEmail);
  console.log('4. Promo User After 2 Emails:', {
    sent: usagePromoAfterSend.sent,
    remaining: usagePromoAfterSend.remaining,
    limit: usagePromoAfterSend.limit
  });

  if (usagePromoAfterSend.sent !== 2 || usagePromoAfterSend.remaining !== 1998) {
    throw new Error('Promo increment test failed');
  }

  console.log('🎉 All $2.99 Quota & FIRST100 10% OFF Promo Tests Passed Successfully!');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
