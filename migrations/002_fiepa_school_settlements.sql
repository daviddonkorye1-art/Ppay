-- School settlement tracking is separate from customer wallet allocation.
-- Recording a settlement requires externally verified evidence; this migration does not initiate transfers.
BEGIN;
CREATE TABLE IF NOT EXISTS school_settlements (
 id TEXT PRIMARY KEY,
 invoice_payment_id TEXT NOT NULL UNIQUE REFERENCES school_invoice_payments(id),
 school_id TEXT NOT NULL REFERENCES schools(id),
 amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
 currency TEXT NOT NULL DEFAULT 'GHS' CHECK (currency = 'GHS'),
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SETTLED')),
 external_reference TEXT,
 evidence_note TEXT,
 verified_by TEXT REFERENCES users(id),
 verified_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT school_settlement_verified_fields CHECK (
  (status = 'PENDING' AND verified_at IS NULL AND verified_by IS NULL AND external_reference IS NULL)
  OR (status = 'SETTLED' AND verified_at IS NOT NULL AND verified_by IS NOT NULL AND external_reference IS NOT NULL)
 )
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_school_settlements_external_reference
 ON school_settlements(external_reference) WHERE external_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_school_settlements_status ON school_settlements(status,created_at);
COMMIT;
