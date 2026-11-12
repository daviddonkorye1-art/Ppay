-- Fiepa Pay: additive school invoice schema (GHS minor units).
-- Run in a controlled migration transaction after verifying the existing database backup.
BEGIN;
CREATE TABLE IF NOT EXISTS school_invoices (
 id TEXT PRIMARY KEY,
 school_id TEXT NOT NULL REFERENCES schools(id),
 invoice_reference TEXT NOT NULL,
 student_identifier TEXT NOT NULL,
 student_name TEXT NOT NULL,
 academic_term TEXT,
 amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
 currency TEXT NOT NULL DEFAULT 'GHS' CHECK (currency = 'GHS'),
 status TEXT NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED','CANCELLED','PAID')),
 due_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 paid_at TIMESTAMPTZ,
 UNIQUE (school_id, invoice_reference),
 UNIQUE (id, school_id)
);
CREATE INDEX IF NOT EXISTS idx_school_invoices_student ON school_invoices(school_id,student_identifier);
CREATE INDEX IF NOT EXISTS idx_school_invoices_status ON school_invoices(school_id,status);
CREATE TABLE IF NOT EXISTS school_invoice_payments (
 id TEXT PRIMARY KEY,
 invoice_id TEXT NOT NULL REFERENCES school_invoices(id),
 customer_id TEXT NOT NULL REFERENCES users(id),
 school_payment_id TEXT UNIQUE REFERENCES school_payments(id),
 provider_reference TEXT UNIQUE,
 amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
 currency TEXT NOT NULL DEFAULT 'GHS' CHECK (currency = 'GHS'),
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CONFIRMED','FAILED','REFUNDED')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 confirmed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_confirmed_payment_per_invoice
 ON school_invoice_payments(invoice_id) WHERE status = 'CONFIRMED';
COMMIT;
