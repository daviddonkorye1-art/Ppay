# PurposePay API v0.5

Node.js API foundation for the PurposePay MVP. The runtime uses PostgreSQL and creates the required relational schema during startup.

## Run

```bash
npm install
DATABASE_URL="postgres://user:password@host:5432/purposepay_db" PURPOSEPAY_JWT_SECRET="replace-me-with-a-long-random-secret" npm start
```

Health check: `GET http://localhost:8787/api/health`

In production, `DATABASE_URL` is required.

## Implemented

- Customer registration/login with bcrypt password hashing and JWT sessions
- Mandatory KYC submission endpoint and verification status tracking
- Customer projects
- Purpose-restricted vouchers
- Approved merchant/category validation
- Purchase authorization codes
- Atomic purchase completion and voucher balance updates using PostgreSQL transactions
- Customer transaction history
- School payment creation with verified-KYC requirement
- Admin overview, KYC, risk and audit endpoints
- Login rate limiting
- Contractor project access controls
- Merchant controls
- Idempotency keys for state-changing payment operations
- Audit logging
- Production-safe JWT issuer/audience validation
- Static path traversal protection

## Production requirements before real-money launch

- Qualified KYC/KYB provider
- Secure document/object storage
- Licensed payment/remittance partner and signed webhooks
- Payment reconciliation and settlement controls
- MFA/session rotation and stronger account recovery
- Encryption/key management and security monitoring
- Formal authorization policies for contractor/merchant/admin roles
- Fraud monitoring and operational review
- Independent security testing
- Legal/compliance review for Ghana and customer source markets

This repository is a development MVP and is not yet a live-money payment system.
