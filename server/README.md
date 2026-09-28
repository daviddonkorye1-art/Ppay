# PurposePay API foundation

Node.js API foundation for the PurposePay MVP. It uses SQLite locally so the project can be run immediately; the schema is deliberately relational and can be migrated to PostgreSQL for production.

## Run

```bash
npm install
PURPOSEPAY_JWT_SECRET="replace-me" npm start
```

Health check: `GET http://localhost:8787/api/health`

## Implemented

- Customer registration/login with bcrypt password hashing and JWT sessions
- Mandatory KYC submission endpoint and verification status tracking
- Customer projects
- Purpose-restricted vouchers
- Approved merchant/category validation
- Purchase authorization codes
- Atomic purchase completion and voucher balance updates
- Customer transaction history
- School payment creation
- Admin overview endpoint
- Audit log

## Production replacements

- PostgreSQL + migrations
- Secure secret management
- MFA/session rotation/rate limiting
- Object storage for KYC/receipts
- Qualified KYC/KYB provider
- Licensed payment/remittance partner and signed webhooks
- Strong authorization policies for contractor/merchant/admin roles
- Idempotency keys and reconciliation
- Encryption/key management and security monitoring
