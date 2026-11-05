import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.sqlite');
const CONFIG_FILE = path.join(DATA_DIR, 'square_config.json');
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json');
const CALENDAR_FILE = path.join(DATA_DIR, 'calendar_settings.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Open SQLite Database with WAL mode for fast concurrency
export const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');

// Initialize Database Schema
export function initDatabase() {
  // 1. Bookings Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      confirmation_number TEXT UNIQUE,
      created_at TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      city_state_zip TEXT,
      participating_adults TEXT,
      participating_children TEXT,
      participating_pets TEXT,
      notes TEXT,
      referral TEXT,
      session_key TEXT,
      session_title TEXT,
      total_price REAL,
      deposit_amount REAL,
      remaining_balance REAL,
      appointment_date TEXT,
      appointment_time TEXT,
      appointment_raw_date TEXT,
      payment_method TEXT,
      payment_id TEXT,
      order_id TEXT,
      payment_status TEXT,
      receipt_url TEXT,
      card_brand TEXT,
      card_last4 TEXT,
      status TEXT DEFAULT 'CONFIRMED',
      balance_status TEXT DEFAULT 'UNPAID',
      admin_notes TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_appointment_raw_date ON bookings(appointment_raw_date);
    CREATE INDEX IF NOT EXISTS idx_confirmation_number ON bookings(confirmation_number);
    CREATE INDEX IF NOT EXISTS idx_status ON bookings(status);
  `);

  // 2. Calendar Settings Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS calendar_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      default_slots TEXT,
      recurring_closed_days TEXT,
      blocked_dates TEXT,
      date_overrides TEXT,
      updated_at TEXT
    );
  `);

  // 3. Square Gateway Config Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS square_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      environment TEXT DEFAULT 'sandbox',
      deposit_amount REAL DEFAULT 100,
      currency TEXT DEFAULT 'USD',
      admin_password TEXT,
      sandbox_app_id TEXT,
      sandbox_access_token TEXT,
      sandbox_location_id TEXT,
      prod_app_id TEXT,
      prod_access_token TEXT,
      prod_location_id TEXT,
      updated_at TEXT
    );
  `);

  // Initial Data Migration from JSON if table empty
  migrateDataFromJsonIfEmpty();

  console.log('✅ SQLite Database initialized successfully at:', DB_FILE);
}

// Data Migration from JSON on first launch
function migrateDataFromJsonIfEmpty() {
  // Migrate Square Config
  const squareRow = db.prepare('SELECT id FROM square_config WHERE id = 1').get();
  if (!squareRow) {
    let conf = {
      environment: 'sandbox',
      depositAmount: 100,
      currency: 'USD',
      adminPassword: 'Admin2026@Square',
      sandbox: { applicationId: '', accessToken: '', locationId: '' },
      production: { applicationId: '', accessToken: '', locationId: '' }
    };
    if (fs.existsSync(CONFIG_FILE)) {
      try {
        conf = { ...conf, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) };
      } catch (e) {}
    }

    db.prepare(`
      INSERT INTO square_config (
        id, environment, deposit_amount, currency, admin_password,
        sandbox_app_id, sandbox_access_token, sandbox_location_id,
        prod_app_id, prod_access_token, prod_location_id, updated_at
      ) VALUES (
        1, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?
      )
    `).run(
      conf.environment || 'sandbox',
      conf.depositAmount || 100,
      conf.currency || 'USD',
      conf.adminPassword || 'Admin2026@Square',
      conf.sandbox?.applicationId || '',
      conf.sandbox?.accessToken || '',
      conf.sandbox?.locationId || '',
      conf.production?.applicationId || '',
      conf.production?.accessToken || '',
      conf.production?.locationId || '',
      new Date().toISOString()
    );
  }

  // Migrate Calendar Settings
  const calRow = db.prepare('SELECT id FROM calendar_settings WHERE id = 1').get();
  if (!calRow) {
    let cal = {
      defaultSlots: ['09:00 AM', '11:30 AM', '02:00 PM', '04:30 PM', '07:30 PM'],
      recurringClosedDays: [],
      blockedDates: [],
      dateOverrides: {}
    };
    if (fs.existsSync(CALENDAR_FILE)) {
      try {
        cal = { ...cal, ...JSON.parse(fs.readFileSync(CALENDAR_FILE, 'utf-8')) };
      } catch (e) {}
    }

    db.prepare(`
      INSERT INTO calendar_settings (
        id, default_slots, recurring_closed_days, blocked_dates, date_overrides, updated_at
      ) VALUES (1, ?, ?, ?, ?, ?)
    `).run(
      JSON.stringify(cal.defaultSlots || []),
      JSON.stringify(cal.recurringClosedDays || []),
      JSON.stringify(cal.blockedDates || []),
      JSON.stringify(cal.dateOverrides || {}),
      new Date().toISOString()
    );
  }

  // Migrate Bookings
  const bookingCount = db.prepare('SELECT COUNT(*) as count FROM bookings').get().count;
  if (bookingCount === 0 && fs.existsSync(BOOKINGS_FILE)) {
    try {
      const bookingsJson = JSON.parse(fs.readFileSync(BOOKINGS_FILE, 'utf-8'));
      if (Array.isArray(bookingsJson)) {
        const insertStmt = db.prepare(`
          INSERT OR REPLACE INTO bookings (
            id, confirmation_number, created_at,
            first_name, last_name, phone, email, address, city_state_zip,
            participating_adults, participating_children, participating_pets, notes, referral,
            session_key, session_title, total_price, deposit_amount, remaining_balance,
            appointment_date, appointment_time, appointment_raw_date,
            payment_method, payment_id, order_id, payment_status, receipt_url, card_brand, card_last4,
            status, balance_status, admin_notes
          ) VALUES (
            ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?
          )
        `);

        for (const b of bookingsJson) {
          insertStmt.run(
            b.id,
            b.confirmationNumber || b.id,
            b.createdAt || new Date().toISOString(),
            b.customer?.firstName || '',
            b.customer?.lastName || '',
            b.customer?.phone || '',
            b.customer?.email || '',
            b.customer?.address || '',
            b.customer?.cityStateZip || '',
            b.customer?.participatingAdults || '',
            b.customer?.participatingChildren || '',
            b.customer?.participatingPets || '',
            b.customer?.notes || '',
            b.customer?.referral || '',
            b.session?.key || '',
            b.session?.title || '',
            b.session?.totalPrice || 0,
            b.session?.depositAmount || 100,
            b.session?.remainingBalance || 0,
            b.appointment?.date || '',
            b.appointment?.time || '',
            b.appointment?.rawDate || '',
            b.payment?.method || 'square_web_payments_sdk',
            b.payment?.paymentId || '',
            b.payment?.orderId || '',
            b.payment?.status || 'COMPLETED',
            b.payment?.receiptUrl || '',
            b.payment?.cardBrand || 'VISA',
            b.payment?.last4 || '****',
            b.status || 'CONFIRMED',
            b.balanceStatus || 'UNPAID',
            b.adminNotes || ''
          );
        }
        console.log(`📦 Migrated ${bookingsJson.length} bookings into SQLite database.`);
      }
    } catch (e) {
      console.error('Error during initial bookings migration:', e);
    }
  }
}

// Convert SQLite row into unified Booking Object
function rowToBookingObject(row) {
  if (!row) return null;
  return {
    id: row.id,
    confirmationNumber: row.confirmation_number,
    createdAt: row.created_at,
    customer: {
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone,
      email: row.email,
      address: row.address,
      cityStateZip: row.city_state_zip,
      participatingAdults: row.participating_adults,
      participatingChildren: row.participating_children,
      participatingPets: row.participating_pets,
      notes: row.notes,
      referral: row.referral
    },
    session: {
      key: row.session_key,
      title: row.session_title,
      totalPrice: row.total_price,
      depositAmount: row.deposit_amount,
      remainingBalance: row.remaining_balance
    },
    appointment: {
      date: row.appointment_date,
      time: row.appointment_time,
      rawDate: row.appointment_raw_date
    },
    payment: {
      method: row.payment_method,
      paymentId: row.payment_id,
      orderId: row.order_id,
      status: row.payment_status,
      amount: row.deposit_amount,
      currency: 'USD',
      receiptUrl: row.receipt_url,
      cardBrand: row.card_brand,
      last4: row.card_last4,
      paidAt: row.created_at
    },
    status: row.status,
    balanceStatus: row.balance_status,
    adminNotes: row.admin_notes
  };
}

/* ==========================================================================
   CRUD Methods: Bookings
   ========================================================================== */

export function getAllBookings() {
  const rows = db.prepare('SELECT * FROM bookings ORDER BY datetime(created_at) DESC').all();
  return rows.map(rowToBookingObject);
}

export function getBookingById(id) {
  const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
  return rowToBookingObject(row);
}

export function saveNewBooking(b) {
  const stmt = db.prepare(`
    INSERT INTO bookings (
      id, confirmation_number, created_at,
      first_name, last_name, phone, email, address, city_state_zip,
      participating_adults, participating_children, participating_pets, notes, referral,
      session_key, session_title, total_price, deposit_amount, remaining_balance,
      appointment_date, appointment_time, appointment_raw_date,
      payment_method, payment_id, order_id, payment_status, receipt_url, card_brand, card_last4,
      status, balance_status, admin_notes
    ) VALUES (
      ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?
    )
  `);

  stmt.run(
    b.id,
    b.confirmationNumber,
    b.createdAt,
    b.customer?.firstName || '',
    b.customer?.lastName || '',
    b.customer?.phone || '',
    b.customer?.email || '',
    b.customer?.address || '',
    b.customer?.cityStateZip || '',
    b.customer?.participatingAdults || '',
    b.customer?.participatingChildren || '',
    b.customer?.participatingPets || '',
    b.customer?.notes || '',
    b.customer?.referral || '',
    b.session?.key || '',
    b.session?.title || '',
    b.session?.totalPrice || 0,
    b.session?.depositAmount || 100,
    b.session?.remainingBalance || 0,
    b.appointment?.date || '',
    b.appointment?.time || '',
    b.appointment?.rawDate || '',
    b.payment?.method || 'square_web_payments_sdk',
    b.payment?.paymentId || '',
    b.payment?.orderId || '',
    b.payment?.status || 'COMPLETED',
    b.payment?.receiptUrl || '',
    b.payment?.cardBrand || 'VISA',
    b.payment?.last4 || '****',
    b.status || 'CONFIRMED',
    b.balanceStatus || 'UNPAID',
    b.adminNotes || ''
  );

  syncBookingsToJsonBackup();
  return b;
}

export function updateBooking(id, updates) {
  const existing = getBookingById(id);
  if (!existing) return null;

  const status = updates.status !== undefined ? updates.status : existing.status;
  const balanceStatus = updates.balanceStatus !== undefined ? updates.balanceStatus : existing.balanceStatus;
  const adminNotes = updates.adminNotes !== undefined ? updates.adminNotes : existing.adminNotes;

  db.prepare(`
    UPDATE bookings 
    SET status = ?, balance_status = ?, admin_notes = ? 
    WHERE id = ?
  `).run(status, balanceStatus, adminNotes, id);

  syncBookingsToJsonBackup();
  return getBookingById(id);
}

export function deleteBooking(id) {
  const result = db.prepare('DELETE FROM bookings WHERE id = ?').run(id);
  syncBookingsToJsonBackup();
  return result.changes > 0;
}

function syncBookingsToJsonBackup() {
  try {
    const all = getAllBookings();
    fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(all, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error syncing bookings backup JSON:', e);
  }
}

/* ==========================================================================
   CRUD Methods: Calendar Settings
   ========================================================================== */

export function getCalendarSettings() {
  const row = db.prepare('SELECT * FROM calendar_settings WHERE id = 1').get();
  if (!row) {
    return {
      defaultSlots: ['09:00 AM', '11:30 AM', '02:00 PM', '04:30 PM', '07:30 PM'],
      recurringClosedDays: [],
      blockedDates: [],
      dateOverrides: {}
    };
  }
  return {
    defaultSlots: JSON.parse(row.default_slots || '[]'),
    recurringClosedDays: JSON.parse(row.recurring_closed_days || '[]'),
    blockedDates: JSON.parse(row.blocked_dates || '[]'),
    dateOverrides: JSON.parse(row.date_overrides || '{}')
  };
}

export function saveCalendarSettings(settings) {
  db.prepare(`
    INSERT INTO calendar_settings (
      id, default_slots, recurring_closed_days, blocked_dates, date_overrides, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      default_slots = excluded.default_slots,
      recurring_closed_days = excluded.recurring_closed_days,
      blocked_dates = excluded.blocked_dates,
      date_overrides = excluded.date_overrides,
      updated_at = excluded.updated_at
  `).run(
    JSON.stringify(settings.defaultSlots || []),
    JSON.stringify(settings.recurringClosedDays || []),
    JSON.stringify(settings.blockedDates || []),
    JSON.stringify(settings.dateOverrides || {}),
    new Date().toISOString()
  );

  try {
    fs.writeFileSync(CALENDAR_FILE, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (e) {}
}

/* ==========================================================================
   CRUD Methods: Square Gateway Config
   ========================================================================== */

export function getSquareConfig() {
  const row = db.prepare('SELECT * FROM square_config WHERE id = 1').get();
  if (!row) {
    return {
      environment: 'sandbox',
      depositAmount: 100,
      currency: 'USD',
      adminPassword: 'Admin2026@Square',
      sandbox: { applicationId: '', accessToken: '', locationId: '' },
      production: { applicationId: '', accessToken: '', locationId: '' }
    };
  }
  return {
    environment: row.environment || 'sandbox',
    depositAmount: row.deposit_amount || 100,
    currency: row.currency || 'USD',
    adminPassword: row.admin_password || 'Admin2026@Square',
    sandbox: {
      applicationId: row.sandbox_app_id || '',
      accessToken: row.sandbox_access_token || '',
      locationId: row.sandbox_location_id || ''
    },
    production: {
      applicationId: row.prod_app_id || '',
      accessToken: row.prod_access_token || '',
      locationId: row.prod_location_id || ''
    }
  };
}

export function saveSquareConfig(conf) {
  db.prepare(`
    INSERT INTO square_config (
      id, environment, deposit_amount, currency, admin_password,
      sandbox_app_id, sandbox_access_token, sandbox_location_id,
      prod_app_id, prod_access_token, prod_location_id, updated_at
    ) VALUES (
      1, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
      environment = excluded.environment,
      deposit_amount = excluded.deposit_amount,
      currency = excluded.currency,
      admin_password = excluded.admin_password,
      sandbox_app_id = excluded.sandbox_app_id,
      sandbox_access_token = excluded.sandbox_access_token,
      sandbox_location_id = excluded.sandbox_location_id,
      prod_app_id = excluded.prod_app_id,
      prod_access_token = excluded.prod_access_token,
      prod_location_id = excluded.prod_location_id,
      updated_at = excluded.updated_at
  `).run(
    conf.environment || 'sandbox',
    conf.depositAmount || 100,
    conf.currency || 'USD',
    conf.adminPassword || 'Admin2026@Square',
    conf.sandbox?.applicationId || '',
    conf.sandbox?.accessToken || '',
    conf.sandbox?.locationId || '',
    conf.production?.applicationId || '',
    conf.production?.accessToken || '',
    conf.production?.locationId || '',
    new Date().toISOString()
  );

  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(conf, null, 2), 'utf-8');
  } catch (e) {}
}
