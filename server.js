import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Data directory & files
const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'square_config.json');
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Active admin session tokens (token -> expiry timestamp)
const adminSessions = new Map();

// Helper: Read Square Config
function readSquareConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      return data;
    }
  } catch (err) {
    console.error('Error reading square_config.json:', err);
  }
  return {
    environment: process.env.SQUARE_ENVIRONMENT || 'sandbox',
    depositAmount: 100,
    currency: 'USD',
    adminPassword: process.env.ADMIN_PASSWORD || 'Admin2026@Square',
    sandbox: {
      applicationId: process.env.SQUARE_SANDBOX_APP_ID || '',
      accessToken: process.env.SQUARE_SANDBOX_ACCESS_TOKEN || '',
      locationId: process.env.SQUARE_SANDBOX_LOCATION_ID || ''
    },
    production: {
      applicationId: process.env.SQUARE_PROD_APP_ID || '',
      accessToken: process.env.SQUARE_PROD_ACCESS_TOKEN || '',
      locationId: process.env.SQUARE_PROD_LOCATION_ID || ''
    }
  };
}

// Helper: Save Square Config
function saveSquareConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

// Helper: Read Bookings
function readBookings() {
  try {
    if (fs.existsSync(BOOKINGS_FILE)) {
      return JSON.parse(fs.readFileSync(BOOKINGS_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Error reading bookings.json:', err);
  }
  return [];
}

// Helper: Save Bookings
function saveBookings(bookings) {
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2), 'utf-8');
}

// Helper: Get active Square Credentials based on environment
function getActiveSquareCredentials(config) {
  const env = config.environment === 'production' ? 'production' : 'sandbox';
  const creds = config[env] || {};
  const baseUrl = env === 'production' 
    ? 'https://connect.squareup.com' 
    : 'https://connect.squareupsandbox.com';

  return {
    environment: env,
    applicationId: creds.applicationId || '',
    accessToken: creds.accessToken || '',
    locationId: creds.locationId || '',
    baseUrl
  };
}

// Middleware
app.use(cors());
app.use(express.json());

// Serve static website files
app.use(express.static(__dirname));

// Auth Middleware for Admin Routes
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.split(' ')[1];
  const expiry = adminSessions.get(token);
  if (!expiry || Date.now() > expiry) {
    adminSessions.delete(token);
    return res.status(401).json({ error: 'Session expired, please log in again' });
  }

  // Refresh session on activity (4 hours)
  adminSessions.set(token, Date.now() + 4 * 60 * 60 * 1000);
  next();
}

/* ==========================================================================
   PUBLIC API: Square Configuration & Payments
   ========================================================================== */

// 1. Get Public Square Configuration (Safe for frontend Web Payments SDK)
app.get('/api/square/config', (req, res) => {
  const config = readSquareConfig();
  const active = getActiveSquareCredentials(config);

  res.json({
    success: true,
    environment: active.environment,
    applicationId: active.applicationId,
    locationId: active.locationId,
    depositAmount: config.depositAmount || 100,
    currency: config.currency || 'USD',
    isConfigured: Boolean(active.applicationId && active.accessToken && active.locationId)
  });
});

// 2. Process Square Payment (Web Payments SDK Nonce / Token)
app.post('/api/square/process-payment', async (req, res) => {
  try {
    const { sourceId, bookingDetails } = req.body;

    if (!sourceId) {
      return res.status(400).json({ error: 'Payment token (sourceId) is required.' });
    }
    if (!bookingDetails || !bookingDetails.customer || !bookingDetails.session) {
      return res.status(400).json({ error: 'Complete booking details are required.' });
    }

    const config = readSquareConfig();
    const active = getActiveSquareCredentials(config);
    const depositAmount = config.depositAmount || 100;
    const currency = config.currency || 'USD';

    let paymentResult = null;
    const isMock = sourceId === 'mock_card_token' || !active.accessToken;

    if (!isMock) {
      // Call official Square Payments API v2
      const idempotencyKey = crypto.randomUUID();
      const amountInCents = Math.round(depositAmount * 100);

      const customerName = `${bookingDetails.customer.firstName || ''} ${bookingDetails.customer.lastName || ''}`.trim();
      const note = `Deposit: ${bookingDetails.session.title || 'Session'} (${customerName})`;

      const squareRes = await fetch(`${active.baseUrl}/v2/payments`, {
        method: 'POST',
        headers: {
          'Square-Version': '2024-05-15',
          'Authorization': `Bearer ${active.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          source_id: sourceId,
          idempotency_key: idempotencyKey,
          amount_money: {
            amount: amountInCents,
            currency: currency
          },
          autocomplete: true,
          location_id: active.locationId,
          reference_id: `BK-${Date.now()}`,
          note: note.substring(0, 500),
          buyer_email_address: bookingDetails.customer.email || undefined
        })
      });

      const squareData = await squareRes.json();

      if (!squareRes.ok || squareData.errors) {
        const errorDetail = squareData.errors ? squareData.errors.map(e => e.detail || e.message).join('; ') : 'Payment failed at Square';
        console.error('Square Payment API error:', squareData);
        return res.status(400).json({
          error: errorDetail,
          squareErrors: squareData.errors
        });
      }

      const p = squareData.payment;
      paymentResult = {
        paymentId: p.id,
        orderId: p.order_id || null,
        status: p.status,
        amount: depositAmount,
        currency: currency,
        receiptUrl: p.receipt_url || null,
        cardBrand: p.card_details?.card?.card_brand || 'CARD',
        last4: p.card_details?.card?.last_4 || '****',
        paidAt: p.created_at || new Date().toISOString()
      };
    } else {
      // Demo / Mock fallback mode when testing before API credentials entered
      paymentResult = {
        paymentId: 'sq_demo_' + Date.now(),
        orderId: 'sq_ord_demo_' + Math.floor(1000 + Math.random() * 9000),
        status: 'COMPLETED',
        amount: depositAmount,
        currency: currency,
        receiptUrl: 'https://squareup.com/receipt/preview/demo',
        cardBrand: 'VISA (Demo)',
        last4: '1111',
        paidAt: new Date().toISOString(),
        isDemo: true
      };
    }

    // Generate Unique Booking Confirmation Number
    const year = new Date().getFullYear();
    const confNumber = `NFS-${year}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newBooking = {
      id: `BK-${Date.now()}`,
      confirmationNumber: confNumber,
      createdAt: new Date().toISOString(),
      customer: bookingDetails.customer,
      session: {
        key: bookingDetails.session.key || 'custom',
        title: bookingDetails.session.title || 'Photography Session',
        totalPrice: bookingDetails.session.price || depositAmount,
        depositAmount: depositAmount,
        remainingBalance: Math.max(0, (bookingDetails.session.price || depositAmount) - depositAmount)
      },
      appointment: bookingDetails.appointment || {},
      payment: {
        method: 'square_web_payments_sdk',
        ...paymentResult
      },
      status: 'CONFIRMED',
      balanceStatus: 'UNPAID'
    };

    // Save to database
    const bookings = readBookings();
    bookings.unshift(newBooking);
    saveBookings(bookings);

    res.json({
      success: true,
      booking: newBooking,
      paymentId: paymentResult.paymentId,
      receiptUrl: paymentResult.receiptUrl,
      confirmationNumber: confNumber,
      isDemo: Boolean(paymentResult.isDemo)
    });

  } catch (err) {
    console.error('Error processing Square payment:', err);
    res.status(500).json({ error: err.message || 'Server error processing payment.' });
  }
});

// 3. Create Square Checkout Link (Alternative Hosted Checkout)
app.post('/api/square/create-checkout', async (req, res) => {
  try {
    const { bookingDetails } = req.body;
    if (!bookingDetails) {
      return res.status(400).json({ error: 'Booking details are required.' });
    }

    const config = readSquareConfig();
    const active = getActiveSquareCredentials(config);
    const depositAmount = config.depositAmount || 100;
    const currency = config.currency || 'USD';

    if (!active.accessToken || !active.locationId) {
      return res.status(400).json({ error: 'Square Access Token and Location ID must be configured in Admin first.' });
    }

    const host = req.get('host');
    const protocol = req.protocol;
    const origin = `${protocol}://${host}`;

    const tempOrderId = `BK-${Date.now()}`;
    const amountInCents = Math.round(depositAmount * 100);

    const squareRes = await fetch(`${active.baseUrl}/v2/online-checkout/payment-links`, {
      method: 'POST',
      headers: {
        'Square-Version': '2024-05-15',
        'Authorization': `Bearer ${active.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        idempotency_key: crypto.randomUUID(),
        quick_pay: {
          name: `${bookingDetails.session?.title || 'Photography Session'} Deposit`,
          price_money: {
            amount: amountInCents,
            currency: currency
          },
          location_id: active.locationId
        },
        description: `Deposit payment for ${bookingDetails.session?.title} on ${bookingDetails.appointment?.date || 'scheduled date'}`,
        redirect_url: `${origin}/booking.html?payment=success&ref=${tempOrderId}`,
        payment_note: `Client: ${bookingDetails.customer?.firstName} ${bookingDetails.customer?.lastName} (${bookingDetails.customer?.phone})`
      })
    });

    const squareData = await squareRes.json();
    if (!squareRes.ok || squareData.errors) {
      return res.status(400).json({
        error: squareData.errors ? squareData.errors.map(e => e.detail || e.message).join('; ') : 'Checkout link creation failed'
      });
    }

    res.json({
      success: true,
      checkoutUrl: squareData.payment_link.url,
      orderId: squareData.payment_link.order_id
    });
  } catch (err) {
    console.error('Error creating Square Checkout link:', err);
    res.status(500).json({ error: err.message || 'Server error creating checkout link.' });
  }
});

// 4. Square Webhook Receiver
app.post('/api/square/webhook', async (req, res) => {
  try {
    const event = req.body;
    console.log('Received Square Webhook Event:', event?.type);

    if (event && event.type === 'payment.updated') {
      const payment = event.data?.object?.payment;
      if (payment && payment.status === 'COMPLETED') {
        const bookings = readBookings();
        const b = bookings.find(item => item.payment && item.payment.paymentId === payment.id);
        if (b) {
          b.payment.status = 'COMPLETED';
          b.status = 'CONFIRMED';
          saveBookings(bookings);
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: 'Webhook processing error' });
  }
});

/* ==========================================================================
   ADMIN MANAGEMENT API
   ========================================================================== */

// 1. Admin Login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  const config = readSquareConfig();
  const validPassword = config.adminPassword || process.env.ADMIN_PASSWORD || 'Admin2026@Square';

  if (password === validPassword) {
    const token = crypto.randomBytes(32).toString('hex');
    // Session valid for 4 hours
    adminSessions.set(token, Date.now() + 4 * 60 * 60 * 1000);
    res.json({ success: true, token });
  } else {
    res.status(401).json({ error: 'Incorrect administrator password.' });
  }
});

// 2. Admin Check Token Status
app.get('/api/admin/me', requireAdminAuth, (req, res) => {
  res.json({ success: true, user: 'admin' });
});

// 3. Admin Get Bookings List
app.get('/api/admin/bookings', requireAdminAuth, (req, res) => {
  const bookings = readBookings();
  res.json({ success: true, bookings });
});

// 4. Admin Update Booking (e.g. balance paid, notes, status)
app.patch('/api/admin/bookings/:id', requireAdminAuth, (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const bookings = readBookings();
  const index = bookings.findIndex(b => b.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Booking not found.' });
  }

  // Apply allowed updates
  if (updates.status) bookings[index].status = updates.status;
  if (updates.balanceStatus) bookings[index].balanceStatus = updates.balanceStatus;
  if (updates.adminNotes !== undefined) bookings[index].adminNotes = updates.adminNotes;

  saveBookings(bookings);
  res.json({ success: true, booking: bookings[index] });
});

// 5. Admin Delete Booking
app.delete('/api/admin/bookings/:id', requireAdminAuth, (req, res) => {
  const { id } = req.params;
  let bookings = readBookings();
  const initialLength = bookings.length;
  bookings = bookings.filter(b => b.id !== id);

  if (bookings.length === initialLength) {
    return res.status(404).json({ error: 'Booking not found.' });
  }

  saveBookings(bookings);
  res.json({ success: true, message: 'Booking deleted successfully.' });
});

// 6. Admin Get Square Settings
app.get('/api/admin/square-settings', requireAdminAuth, (req, res) => {
  const config = readSquareConfig();
  
  // Mask access tokens for security
  const mask = str => str && str.length > 8 ? str.substring(0, 4) + '••••••••' + str.slice(-4) : str ? '••••••••' : '';

  res.json({
    success: true,
    environment: config.environment || 'sandbox',
    depositAmount: config.depositAmount || 100,
    currency: config.currency || 'USD',
    sandbox: {
      applicationId: config.sandbox?.applicationId || '',
      hasToken: Boolean(config.sandbox?.accessToken),
      maskedToken: mask(config.sandbox?.accessToken),
      locationId: config.sandbox?.locationId || ''
    },
    production: {
      applicationId: config.production?.applicationId || '',
      hasToken: Boolean(config.production?.accessToken),
      maskedToken: mask(config.production?.accessToken),
      locationId: config.production?.locationId || ''
    }
  });
});

// 7. Admin Update Square Settings
app.post('/api/admin/square-settings', requireAdminAuth, (req, res) => {
  const { environment, depositAmount, currency, sandbox, production, newPassword } = req.body;
  const config = readSquareConfig();

  if (environment && ['sandbox', 'production'].includes(environment)) {
    config.environment = environment;
  }
  if (depositAmount && !isNaN(depositAmount)) {
    config.depositAmount = Number(depositAmount);
  }
  if (currency) {
    config.currency = currency;
  }

  // Update Sandbox creds if provided
  if (sandbox) {
    if (sandbox.applicationId !== undefined) config.sandbox.applicationId = sandbox.applicationId.trim();
    if (sandbox.accessToken && !sandbox.accessToken.includes('•••')) config.sandbox.accessToken = sandbox.accessToken.trim();
    if (sandbox.locationId !== undefined) config.sandbox.locationId = sandbox.locationId.trim();
  }

  // Update Production creds if provided
  if (production) {
    if (production.applicationId !== undefined) config.production.applicationId = production.applicationId.trim();
    if (production.accessToken && !production.accessToken.includes('•••')) config.production.accessToken = production.accessToken.trim();
    if (production.locationId !== undefined) config.production.locationId = production.locationId.trim();
  }

  if (newPassword && newPassword.trim().length >= 6) {
    config.adminPassword = newPassword.trim();
  }

  saveSquareConfig(config);
  res.json({ success: true, message: 'Square settings saved successfully!' });
});

// 8. Admin Test Square Connection & Fetch Locations
app.post('/api/admin/test-square', requireAdminAuth, async (req, res) => {
  try {
    const { environment, accessToken } = req.body;
    const config = readSquareConfig();
    const env = environment || config.environment || 'sandbox';
    
    // Use provided token or stored token
    let token = accessToken;
    if (!token || token.includes('•••')) {
      token = config[env]?.accessToken;
    }

    if (!token) {
      return res.status(400).json({ error: 'Access token is required to test Square connection.' });
    }

    const baseUrl = env === 'production' 
      ? 'https://connect.squareup.com' 
      : 'https://connect.squareupsandbox.com';

    // Test by fetching merchant locations
    const squareRes = await fetch(`${baseUrl}/v2/locations`, {
      method: 'GET',
      headers: {
        'Square-Version': '2024-05-15',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await squareRes.json();

    if (!squareRes.ok || data.errors) {
      const err = data.errors ? data.errors.map(e => e.detail || e.message).join('; ') : 'Authentication failed';
      return res.status(400).json({ success: false, error: err });
    }

    const locations = (data.locations || []).map(loc => ({
      id: loc.id,
      name: loc.name,
      businessName: loc.business_name || loc.name,
      status: loc.status,
      address: loc.address ? `${loc.address.address_line_1 || ''}, ${loc.address.locality || ''} ${loc.address.administrative_district_level_1 || ''}` : '',
      currency: loc.currency
    }));

    res.json({
      success: true,
      environment: env,
      locationCount: locations.length,
      locations
    });
  } catch (err) {
    console.error('Error testing Square connection:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to connect to Square API.' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`✨ Nora Family Studio / Taozijia Photography Server`);
  console.log(`🌐 Website running at: http://localhost:${PORT}`);
  console.log(`💳 Square Booking:     http://localhost:${PORT}/booking.html`);
  console.log(`🔐 Admin Dashboard:    http://localhost:${PORT}/admin.html`);
  console.log(`=======================================================`);
});
