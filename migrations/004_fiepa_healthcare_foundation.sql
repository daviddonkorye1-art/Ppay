-- Fiepa healthcare provider onboarding and bill records.
-- Schema only: no payment endpoints, redemption, dispensing or money movement enabled.
BEGIN;
CREATE TABLE IF NOT EXISTS fiepa_healthcare_providers (
 id TEXT PRIMARY KEY,
 legal_name TEXT NOT NULL,
 provider_type TEXT NOT NULL CHECK(provider_type IN ('PHARMACY','HOSPITAL','CLINIC')),
 license_reference TEXT,
 verification_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(verification_status IN ('PENDING','APPROVED','REJECTED','SUSPENDED')),
 verified_by TEXT REFERENCES users(id),
 verified_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(verification_status <> 'APPROVED' OR (license_reference IS NOT NULL AND verified_by IS NOT NULL AND verified_at IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS fiepa_hospital_invoices (
 id TEXT PRIMARY KEY,
 provider_id TEXT NOT NULL REFERENCES fiepa_healthcare_providers(id),
 invoice_reference TEXT NOT NULL,
 patient_billing_reference TEXT NOT NULL,
 amount_minor BIGINT NOT NULL CHECK(amount_minor > 0),
 currency TEXT NOT NULL DEFAULT 'GHS' CHECK(currency='GHS'),
 status TEXT NOT NULL DEFAULT 'ISSUED' CHECK(status IN ('ISSUED','CANCELLED','PAID')),
 due_at TIMESTAMPTZ,
 paid_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(provider_id,invoice_reference)
);
CREATE TABLE IF NOT EXISTS fiepa_pharmacy_vouchers (
 id TEXT PRIMARY KEY,
 customer_id TEXT NOT NULL REFERENCES users(id),
 provider_id TEXT NOT NULL REFERENCES fiepa_healthcare_providers(id),
 recipient_reference TEXT NOT NULL,
 amount_minor BIGINT NOT NULL CHECK(amount_minor > 0),
 currency TEXT NOT NULL DEFAULT 'GHS' CHECK(currency='GHS'),
 status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ISSUED','REDEEMED','CANCELLED','EXPIRED')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 redeemed_at TIMESTAMPTZ,
 CHECK(status <> 'REDEEMED' OR redeemed_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_fiepa_healthcare_provider_status ON fiepa_healthcare_providers(verification_status,provider_type);
CREATE INDEX IF NOT EXISTS idx_fiepa_hospital_invoice_provider ON fiepa_hospital_invoices(provider_id,status);
CREATE INDEX IF NOT EXISTS idx_fiepa_pharmacy_voucher_customer ON fiepa_pharmacy_vouchers(customer_id,created_at DESC);
COMMIT;
