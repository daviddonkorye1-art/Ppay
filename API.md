# PurposePay API v0.8.1

Base URL during local development: `http://localhost:8787/api`

All authenticated endpoints require:

```http
Authorization: Bearer <JWT>
```

JSON requests use:

```http
Content-Type: application/json
```

## Authentication

Customer registration now collects government ID metadata and creates an `UNDER_REVIEW` KYC submission in the same database transaction. Funded customer activity remains blocked until an admin verifies the submission.

### Register
`POST /auth/register`

```json
{"firstName":"Ama","lastName":"Mensah","email":"ama@example.com","password":"minimum8chars","phone":"+233...","documentType":"Passport","documentNumber":"G1234567","countryOfIssue":"Ghana"}
```

### Login
`POST /auth/login`

```json
{"email":"demo@purposepay.test","password":"Demo12345!"}
```

Returns `token` and a safe user object.

## KYC

### Submit government ID
`POST /kyc/submit`

```json
{
  "documentType":"Passport",
  "documentNumber":"G1234567",
  "countryOfIssue":"Ghana",
  "issueDate":"2025-01-01",
  "expiryDate":"2035-01-01"
}
```

Government ID numbers are encrypted at rest and API responses expose only the last four digits. Production document images should use qualified KYC-provider storage; the MVP does not store identity images locally. Production should use a qualified KYC provider and secure document storage rather than keeping sensitive documents in application storage.

## Projects and vouchers

### Create project
`POST /projects`

```json
{"name":"Johnson Family House","location":"Accra","contractorName":"Kwame Mensah","contractorPhone":"+233...","description":"Family house"}
```

### Create voucher
`POST /vouchers`

```json
{"projectId":"PRJ_...","category":"Cement","amount":20000}
```

Amounts are represented as whole GH₵ units in this development MVP.

## Purchase authorization

### Authorize
`POST /transactions/authorize`

```json
{"voucherId":"VCH_...","merchantId":"MER_...","amount":1000}
```

The API checks:
- voucher exists
- caller can use the voucher
- merchant is approved
- merchant supports the voucher category
- requested amount does not exceed the remaining voucher balance

### Complete
`POST /transactions/complete`

```json
{"transactionId":"TXN_...","authorizationCode":"ABC123","receiptUrl":"internal-receipt-reference"}
```

Completion performs the voucher balance update and transaction update atomically in PostgreSQL.

## School payments

### List approved schools
`GET /schools`

### Create school payment
`POST /schools/payments`

```json
{"schoolId":"SCH_...","studentName":"Kojo Mensah","studentId":"STU-123","term":"2026/27 Term 1","amount":5000}
```

A customer must have verified KYC status before submitting a school payment.

## Admin

Admin routes require an authenticated `ADMIN` user.

- `GET /admin/overview`
- `GET /admin/kyc`
- `POST /admin/kyc/:id/review`
- `GET /admin/risk`
- `POST /admin/risk/resolve`
- `GET /admin/audit`

KYC review example:

```json
{"status":"VERIFIED","note":"Identity reviewed"}
```

Risk resolution example:

```json
{"transactionId":"TXN_...","status":"CLEAR"}
```

## Idempotency

State-changing payment operations accept an `Idempotency-Key` header. Use a unique stable key per client operation. Reusing a key with different request data is rejected. The web client generates keys automatically.

## Health

`GET /api/health` returns service and database status. In production the API requires `DATABASE_URL` and reports PostgreSQL as its backing database.


## Merchant onboarding

### Submit merchant application
POST /merchants/apply (MERCHANT role, verified KYC required)

```json
{"businessName":"ABC Materials","category":"Building Materials","businessRegistration":"BR-123","contactPhone":"+233..."}
```

### Merchant application status
GET /merchants/me

### Admin merchant queue
GET /admin/merchants

### Admin merchant review
POST /admin/merchants/:id/review with {"status":"APPROVED"} or {"status":"REJECTED"}.

## Ledger

GET /ledger is available to merchants and admins. Completed voucher purchases create balanced platform/merchant ledger entries. This is an internal accounting ledger; it does not itself move real funds.


## v1 payments

### Create funding payment intent
POST /payments/intent with {amount:100} in whole GHS. Requires verified customer KYC. When PAYMENT_PROVIDER=paystack, the backend initializes a Paystack transaction and returns an authorization URL. When PAYMENT_PROVIDER=demo, no real money is moved.

### Funding status
GET /payments

### Customer PurposePay balance
GET /wallet

### Paystack webhook
POST /webhooks/paystack. The endpoint validates the x-paystack-signature HMAC SHA512 signature, deduplicates webhook events, verifies amount/currency, marks the payment intent successful, credits the customer balance, and posts balanced cash/funds ledger entries.

### Settlement records
GET /settlements for merchants and admins. Completed voucher purchases create PENDING settlement records; actual payout execution remains disabled until a settlement provider is configured.


## v1.1 financial controls

School payments now reserve funds from the customer's PurposePay wallet atomically and create balanced customer-funds/school-payable ledger entries. Admins can review settlement records with POST /admin/settlements/:id/review using APPROVED, PAID, or FAILED. This records settlement state but does not itself transfer money to a bank account.


## v1.2 operational workflows

### Contractor verification
- POST /api/projects/:projectId/contractors/invite — customer invites a contractor by email.
- POST /api/projects/:projectId/contractors/:assignmentId/respond — contractor accepts or declines.
- POST /api/projects/:projectId/contractors/:assignmentId/verify — project owner/admin verifies or revokes the contractor.
- Contractor voucher authorization now requires a VERIFIED project assignment.

### Voucher lifecycle
- POST /api/vouchers/:voucherId/cancel — customer can cancel an unused voucher and return its full allocation to the PurposePay wallet.
- Voucher authorization rejects cancelled/expired vouchers.

### Receipts
- Completed purchases receive an immutable receiptNumber.
- GET /api/transactions/:transactionId/receipt returns a role-authorized receipt record.

### Disputes and refunds
- POST /api/transactions/:transactionId/dispute — customer opens a dispute against a completed transaction.
- GET /api/disputes — customer or admin views disputes.
- POST /api/admin/disputes/:disputeId/resolve — admin rejects a dispute or issues a full wallet refund. Refunds reverse voucher usage and settlement status and create audit/ledger records.
- GET /api/admin/reconciliation — admin reconciliation summary across settlements, transactions, disputes and refunds.
