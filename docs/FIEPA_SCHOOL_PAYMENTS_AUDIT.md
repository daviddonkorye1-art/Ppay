# Fiepa Pay / FPPay — school payments implementation audit

## Brand decision (provisional)
- Customer-facing name: **Fiepa Pay**
- Short name: **FPPay**
- Existing code identifiers and environment variables stay as PurposePay until a backwards-compatible migration is tested.
- Domain and trademark availability have not been verified.

## Verified from current PurposePay server source
- `schools` table exists with approval status.
- `school_payments` table exists with customer, school, student, term, amount, status, and receipt fields.
- `GET /api/schools` lists approved schools.
- `POST /api/schools/payments` requires customer role, KYC checks, and school approval.
- `GET /api/schools/payments` supports customer/admin views.
- A school-specific role, authenticated school dashboard, invoice matching and independently verified school settlement are not established by these routes.

## Next implementation milestones
1. Add a school-specific user association and scoped permissions (school administrators can access only their school).
2. Add school-issued invoices with unique reference, student identifier, currency, due date, and immutable payable amount.
3. Require an invoice match for fee payments and prevent duplicate settlement with an idempotency key and unique payment reference.
4. Introduce lifecycle states: DRAFT, AWAITING_PAYMENT, PAID, SETTLEMENT_PENDING, SETTLED, REFUNDED, FAILED, with validated transitions.
5. Reconcile provider webhooks to the invoice and ledger, verifying signature, currency, amount, reference, and replay safety.
6. Generate downloadable receipts only after verified payment confirmation.
7. Add automated tests for wrong student, wrong invoice, amount mismatch, cross-school access, replayed webhook, refund and settlement.
8. Introduce new UI and branding behind a feature flag; preserve current production behavior until tests pass.

## Safety
No live transfer, disbursement or school settlement should be enabled without an appropriately licensed payment partner and a verified onboarding process. Keep `main` untouched until review.
