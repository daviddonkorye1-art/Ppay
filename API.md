# PurposePay API v0.4

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

### Register
`POST /auth/register`

```json
{"firstName":"Ama","lastName":"Mensah","email":"ama@example.com","password":"minimum8chars","phone":"+233..."}
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

The development build stores document metadata. Production should use a qualified KYC provider and secure document storage rather than keeping sensitive documents in application storage.

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

Completion performs the voucher balance update and transaction update in one SQLite transaction.

## School payments

### List approved schools
`GET /schools`

### Create school payment
`POST /schools/payments`

```json
{"schoolId":"SCH_...","studentName":"Kojo Mensah","studentId":"STU-123","term":"2026/27 Term 1","amount":5000}
```

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
