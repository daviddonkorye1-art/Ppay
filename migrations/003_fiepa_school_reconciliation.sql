-- Read-only reconciliation view. Does not move funds or alter payment status.
-- Flags missing settlement records, mismatched amounts and inconsistent completion states.
BEGIN;
CREATE OR REPLACE VIEW fiepa_school_reconciliation AS
SELECT
 sip.id AS invoice_payment_id,
 sip.invoice_id,
 sip.school_payment_id,
 sip.customer_id,
 si.school_id,
 sip.amount_minor AS invoice_payment_amount_minor,
 si.amount_minor AS invoice_amount_minor,
 sp.amount AS school_payment_amount_minor,
 ss.amount_minor AS settlement_amount_minor,
 sip.currency AS invoice_payment_currency,
 ss.currency AS settlement_currency,
 sip.status AS wallet_payment_status,
 sp.status AS school_payment_status,
 ss.status AS settlement_status,
 ss.external_reference,
 ss.verified_at,
 CASE
   WHEN sp.id IS NULL THEN 'MISSING_SCHOOL_PAYMENT'
   WHEN ss.id IS NULL THEN 'MISSING_SETTLEMENT'
   WHEN sip.amount_minor <> si.amount_minor OR sip.amount_minor <> sp.amount OR sip.amount_minor <> ss.amount_minor THEN 'AMOUNT_MISMATCH'
   WHEN sip.currency <> ss.currency OR sip.currency <> si.currency THEN 'CURRENCY_MISMATCH'
   WHEN sp.status = 'COMPLETED' AND ss.status <> 'SETTLED' THEN 'COMPLETED_WITHOUT_SETTLEMENT'
   WHEN ss.status = 'SETTLED' AND sp.status <> 'COMPLETED' THEN 'SETTLED_PAYMENT_NOT_COMPLETED'
   WHEN sip.status <> 'CONFIRMED' AND ss.status = 'SETTLED' THEN 'UNCONFIRMED_PAYMENT_SETTLED'
   ELSE 'OK'
 END AS reconciliation_status
FROM school_invoice_payments sip
JOIN school_invoices si ON si.id=sip.invoice_id
LEFT JOIN school_payments sp ON sp.id=sip.school_payment_id
LEFT JOIN school_settlements ss ON ss.invoice_payment_id=sip.id;
COMMIT;
