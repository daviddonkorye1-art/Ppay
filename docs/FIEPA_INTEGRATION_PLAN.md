# Fiepa integration plan

PurposePay is the technical foundation. Fiepa is the proposed customer-facing brand. This branch is isolated from main; do not merge or deploy until tests and payment safety reviews pass.

## Existing baselines
- PurposePay: Node.js/PostgreSQL, KYC metadata review, voucher authorization and redemption.
- Fiepa prototype: Python/SQLite, Paystack adapter, SMS, merchant onboarding, 96 local tests reported passing.
- These are different application stacks; do not copy the Python backend into the Node server without an explicit migration design.

## Implementation sequence
1. Inventory and map existing PurposePay routes, database schema, tests and deployments.
2. Map Fiepa domain concepts to PurposePay (users, recipients, merchants, schools, vouchers, orders, payment events, settlements).
3. Add school invoice and school-fee voucher schema and API behind a feature flag. Keep existing voucher APIs backwards compatible.
4. Add school onboarding and verification, invoice validation, receipt records and reconciliation.
5. Integrate payment provider using signed webhooks, idempotency keys, server-side pricing, and immutable audit records. Never activate a voucher from client-only payment claims.
6. Add merchant redemption improvements and recipient notification handling without exposing OTPs or secrets.
7. Design cash transfer flows only after confirming licensed partners, supported corridors, KYC/AML, sanctions screening, refunds and reconciliation.
8. Run automated tests and security review before proposing merge or production deployment.

## Safety constraints
- Never commit .env files, live credentials, personal identity documents, or customer data.
- No production money movement or live payment enablement without provider and regulatory checks.
- Preserve PurposePay main and production deployment.
- Prefer additive database migrations and reversible feature flags.
