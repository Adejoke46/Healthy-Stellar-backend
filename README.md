# Healthy-Stellar-backend

NestJS backend for a decentralized healthcare system built on Stellar Soroban smart contracts.

## Table of Contents

- [Project Structure](#project-structure)
- [Local Development with Docker](#local-development-with-docker)
- [Background Worker Process](#background-worker-process)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Scripts Reference](#scripts-reference)
- [Security Headers](#security-headers)
- [API Endpoints](#api-endpoints)
- [Webhooks](#webhooks)
- [Postman Collection](#postman-collection)
- [Database Schema](#database-schema)
- [Error Handling](#error-handling)
- [Testing](#testing)
- [Deployment](#deployment)

## Project Structure

### Entry points

| File | Purpose |
|---|---|
| `src/main.ts` | HTTP API process — bootstraps the NestJS app, applies global middleware, starts listening |
| `src/worker.ts` | BullMQ worker process — runs queue processors without exposing an HTTP port |
| `src/worker.module.ts` | NestJS module that wires only the queue processors (no HTTP layer) |
| `packages/sdk/` | Auto-generated TypeScript client SDK published to npm |

---

### Module map

Modules are grouped below by domain. Each entry is a top-level directory under `src/`.

#### Clinical

| Directory | Description |
|---|---|
| `patients/` | Patient registry, demographics, geo-restrictions, notification preferences |
| `medical-records/` | Core medical records with version control, consent, clinical notes, attachments |
| `records/` | Versioned record storage with IPFS anchoring and Stellar event-sourcing |
| `pharmacy/` | Drugs, prescriptions, drug interactions, recalls, inventory, controlled substances |
| `laboratory/` | Lab orders, results, specimens, equipment, quality control |
| `appointments/` | Scheduling, consultations, doctor availability |
| `diagnosis/` | Diagnosis management and ICD code handling |
| `treatment-planning/` | Care plans, clinical guidelines, decision-support alerts |
| `medication-administration/` | MAR (Medication Administration Record), barcode verification, adverse reactions |
| `infection-control/` | Outbreak tracking, isolation protocols, antibiotic resistance surveillance |
| `emergency-operations/` | Triage, rapid-response teams, critical care coordination |
| `emergency-medical-info/` | Break-glass emergency access to patient data |
| `pathology/` | Histology, cytology, genetic testing, digital pathology |
| `hospital-registry/` | Hospital and facility configuration |

#### Billing & Finance

| Directory | Description |
|---|---|
| `billing/` | Claims, invoices, insurance, payment processing |

#### Blockchain & Data Integrity

| Directory | Description |
|---|---|
| `stellar/` | Stellar Horizon / Soroban SDK wrapper, transaction retry/recovery |
| `stellar-stream/` | Real-time Stellar event streaming and re-indexing |
| `ledger-reconciliation/` | Detects discrepancies between the DB and on-chain state |
| `reconciliation/` | General data reconciliation jobs |
| `blockchain/` | Low-level blockchain utilities and abstract contract interface |
| `event-store/` | Append-only event-sourcing store for domain aggregates |
| `projections/` | CQRS read-model projections built from the event store |

#### Platform / Infrastructure

| Directory | Description |
|---|---|
| `app.module.ts` | Root module — wires all application modules together |
| `common/` | Shared DTOs, interceptors, filters, guards, audit, pagination, throttler, circuit-breaker |
| `config/` | Database config, env validation schema, logger config |
| `auth/` | JWT, MFA, API keys, session management, OIDC/OAuth2 |
| `OAuth2/` | OIDC provider module (wraps the auth OIDC flow) |
| `rbac/` | Role-Based Access Control policy engine |
| `roles/` | Medical RBAC decorators and guards (MedicalRole enum, MedicalRbacGuard) |
| `access-control/` | Fine-grained access grants, revocations, and consent enforcement |
| `tenant/` | Multi-tenancy — tenant resolution, Row-Level Security (RLS), tenant context |
| `tenant-config/` | Per-tenant feature flags and configuration overrides |
| `notifications/` | WebSocket gateway, transactional outbox, email, notification preferences |
| `queues/` | BullMQ job queues, DLQ, queue dashboard |
| `graphql/` | Apollo GraphQL server, subscriptions, dataloaders, cursor pagination |
| `pubsub/` | GraphQL PubSub transport (Redis-backed) |
| `subscriptions/` | GraphQL subscription lifecycle management |
| `metrics/` | Prometheus metrics, Grafana dashboards, SLO tracking |
| `health/` | `/health` endpoint (Terminus health indicators) |
| `analytics/` | Admin statistics and platform-level activity tracking |
| `jobs/` | Scheduled background jobs (cron-based) |
| `data-retention/` | Automated data-retention policy enforcement |
| `webhooks/` | Outbound webhook delivery, signature verification |
| `idempotency/` | Idempotency-key middleware for safe request replays |
| `dlq/` | Dead-letter queue inspection and replay |
| `incident/` | Incident tracking and escalation |
| `operator-runbook/` | Runbook endpoints for on-call operators |
| `versioning/` | API versioning helpers and deprecation interceptor |
| `admin/` | Admin-only endpoints, user management, system configuration |
| `security/` | Security headers config, IP allowlist, brute-force detection |
| `key-management/` | AWS KMS / local envelope encryption, DEK rotation |
| `encryption/` | PHI field-level encryption (AES-GCM, deterministic column transforms) |
| `i18n/` | Internationalisation (nestjs-i18n), translation files, i18n exception filter |
| `feature-flags/` | Runtime feature-flag evaluation |
| `circuit-breaker/` _(under `common/`)_ | Cockatiel-based circuit breaker for external calls |

#### Compliance & GDPR

| Directory | Description |
|---|---|
| `gdpr/` | GDPR data-subject requests (access, erasure, portability) |
| `data-residency/` | Geo-based data residency enforcement |
| `fhir/` | FHIR R4 resource mapping and bulk export |
| `research-export/` | De-identified, k-anonymous data exports for research |
| `ehr-import/` | Structured import of external EHR data (HL7, CSV) |
| `governance-analytics/` | Compliance dashboards and governance metrics |
| `consistency-checker/` | Cross-system data consistency validation |

---

### Directories that need cleanup ⚠️

The following directories are **named after GitHub issues** rather than their domain, which makes the codebase harder to navigate. They contain valid implementations but should be renamed or merged in a future clean-up PR.

| Directory | Status | Recommended action |
|---|---|---|
| `src/Auto-Generate TypeScript Client SDK from OpenAPI Spec/` | Duplicate — CI workflows only | Move workflows to `.github/workflows/`; delete directory |
| `src/SwaggerOpenAPI Documentation with Full Schema Coverage/` | Contains `export-openapi.ts` | Move script to `scripts/`; delete directory |
| `src/Profile and Optimize Database Query Performance Under Load/` | Contains benchmark scripts | Merge into `scripts/`; delete directory |
| `src/profile-and-optimize-database-query-performance-under-load/` | Duplicate of above (different casing) | Delete after merging |
| `src/Dockerfile and Docker Compose for Production-Ready Containerization/` | Contains CI yml files | Move to `.github/workflows/`; delete directory |
| `src/Build Admin Analytics Dashboard Endpoints/` | Unclear overlap with `analytics/` | Audit and merge or delete |
| `src/Telemedicine and Remote/` | Contains spaces in name; likely overlaps with… | Merge into `telemedicine-and-remote/` and delete |
| `src/telemedicine-and-remote/` | …this directory | Keep this one; delete the spaced variant |
| `src/Tenant Provisioning and Onboarding Workflow/` | Overlaps with… | Merge into `tenant-provisioning-and-onboarding-workflow/` |
| `src/tenant-provisioning-and-onboarding-workflow/` | …this directory | Keep; delete the spaced variant |
| `src/Department and Ward Management/` | Unclear if wired into app.module | Audit and either wire or delete |
| `src/Surgical Management System/` | Unclear if wired into app.module | Audit and either wire or delete |
| `src/Email Notification Service for Critical Access Events/` | Likely superseded by `notifications/` | Audit and delete if redundant |
| `src/Hospital config/` | Likely superseded by `hospital-registry/` | Audit and merge or delete |
| `src/Migration-CLI/` | Likely superseded by TypeORM CLI scripts | Audit and delete if redundant |
| `src/modules/` | Contains a `patient` sub-module alongside `src/patients/` | Audit which is canonical; delete the other |

> Track clean-up work in a dedicated issue. Do not import from the spaced-name directories in new code.

## Local Development with Docker

| Service  | Container   | Port(s)                | Purpose                    |
| -------- | ----------- | ---------------------- | -------------------------- |
| api      | hs-api      | 3000                   | NestJS app with hot reload |
| worker   | hs-worker   | -                      | BullMQ queue processors    |
| postgres | hs-postgres | 5432                   | PostgreSQL 15              |
| redis    | hs-redis    | 6379                   | Redis 7                    |
| mailhog  | hs-mailhog  | 1025 (SMTP), 8025 (UI) | Local email capture        |

```bash
cp .env.docker .env.docker.local
docker compose -f docker-compose.local.yml up --build
docker compose -f docker-compose.local.yml exec api npm run migration:run
docker compose -f docker-compose.local.yml exec api npm run seed
```

- API: http://localhost:3000
- Swagger: http://localhost:3000/api
- MailHog: http://localhost:8025

The `src/` directory is bind-mounted; NestJS runs with `--watch` so changes reload automatically.

```bash
docker compose -f docker-compose.local.yml logs -f api      # Follow API logs
docker compose -f docker-compose.local.yml logs -f worker   # Follow Worker logs
docker compose -f docker-compose.local.yml down             # keep volumes
docker compose -f docker-compose.local.yml down -v          # wipe volumes
```

> `.env.docker` contains placeholder secrets for local use only. Never use outside local dev.

## Background Worker Process

The backend application uses [BullMQ](https://bullmq.io/) for managing and executing background queues. This is essential for offloading heavy operations or interacting with the Stellar blockchain without blocking the main HTTP event loop of the API service.

The worker process is defined in `src/worker.ts` and `src/worker.module.ts`.

> For how `src/blockchain/`, `src/stellar/`, and `src/stellar-stream/` fit
> together and interact with this worker process — including which parts are
> fully wired up versus built-but-not-yet-connected — see
> [`docs/STELLAR_ARCHITECTURE.md`](docs/STELLAR_ARCHITECTURE.md).

### Key Responsibilities

The worker processes tasks from several queues:

- **`contract-writes`**: Schedules and signs write transactions to Stellar Soroban smart contracts.
- **`stellar-transactions`**: Manages blockchain transaction submission and retry logic.
- **`event-indexing`**: Scrapes and indexes events emitted by the smart contracts.
- **`ipfs-uploads`**: Uploads records/PHI hashes to IPFS.
- **`email-notifications`**: Sends transactional and notification emails.
- **`reports`**: Processes PDF/CSV healthcare compliance report generation.
- **`fhir-bulk-export` / `ehr-import`**: Processes FHIR/EHR batch data imports and exports.

### Running the Worker

#### With Docker Compose (Local Dev)

The worker is included in `docker-compose.local.yml` and runs automatically when you spin up the project:

```bash
docker compose -f docker-compose.local.yml up --build
```

#### Bare Metal (Without Docker)

If you run the NestJS API locally using `npm run start:dev`, you **MUST** also start the worker process in a separate terminal:

```bash
npm run start:worker:dev
```

The application will be available at `http://localhost:3000`.
Swagger documentation will be available at `http://localhost:3000/api`.

## Getting Started

**Prerequisites:** Node.js v18+ and PostgreSQL v12+.

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and configure the required values.
3. Run database migrations with `npm run migration:run`.
4. Start the API with `npm run start:dev`.
5. In a separate terminal, start the background worker with `npm run start:worker:dev`.

Run `npm run seed` only when you want to populate a development database with sample data.

## Scripts Reference

The project has 66 npm scripts. A full reference — including descriptions, prerequisites, and safety warnings for destructive scripts — is in **[docs/scripts.md](docs/scripts.md)**.

Quick-start summary:

```bash
npm run start:dev          # API with hot-reload
npm run migration:run      # apply pending DB migrations
npm run seed               # load development reference data
npm run test               # unit tests
npm run test:e2e           # end-to-end tests (requires Docker)
npm run load-test:ci       # k6 load test + CI gate (requires k6)
npm run build:sdk          # build the TypeScript client SDK
```

---

## Configuration

### Environment variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

`.env.example` is the authoritative reference for every environment variable the application reads. Variables are grouped by area and annotated with:

- `[REQUIRED]` — must be set before the app starts in production
- `[OPTIONAL]` — has a safe default; override only when needed
- `[SECRET]` — never commit the real value; use a secrets manager in production

**Key sections in `.env.example`:**

| Section | Variables |
|---|---|
| Application | `NODE_ENV`, `PORT`, `API_URL`, `APP_BASE_URL` |
| Database (primary) | `DATABASE_URL` / `DB_HOST` … `DB_POOL_MAX` |
| Database (read replica) | `DB_REPLICA_HOST` … `DB_REPLICA_POOL_MAX` |
| Redis | `REDIS_URL` / `REDIS_HOST` … `REDIS_DB` |
| JWT & Auth | `JWT_SECRET`, `JWT_EXPIRATION`, `REFRESH_TOKEN_SECRET` |
| Encryption / KMS | `ENCRYPTION_MASTER_KEY`, `MASTER_KEY`, `KMS_ENABLED`, `AWS_*` |
| Stellar / Soroban | `STELLAR_SECRET_KEY`, `STELLAR_CONTRACT_ID`, `SOROBAN_RPC_URL` |
| IPFS | `IPFS_NODE_URL`, `IPFS_GATEWAY`, `IPFS_FALLBACK_GATEWAY` |
| Email / SMTP | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM_ADDRESS` |
| Telemedicine | `TELEMEDICINE_SIGNALING_URL`, `TELEMEDICINE_TOKEN_SECRET` |
| Research export | `RESEARCH_EXPORT_BUCKET`, `RESEARCH_K_ANONYMITY` |
| EHR import | `EHR_IMPORT_S3_BUCKET`, `EHR_IMPORT_MAX_RETRIES` |
| GraphQL subscriptions | `SUBSCRIPTIONS_IDLE_TIMEOUT_MS`, `SUBSCRIPTIONS_MAX_PER_CONNECTION` |
| Ops / alerting | `OPS_SLACK_WEBHOOK_URL`, `QUEUE_DEPTH_THRESHOLD` |
| Migrations | `MIGRATION_EXECUTOR`, `CONFIRM_PRODUCTION_MIGRATION` |

### Data residency and multi-region routing

The backend supports region-aware tenant database routing across four regions: **EU**, **US**, **APAC**, and **AFRICA**. Each tenant declares a residency region and, when `strictDataResidency` is enabled, requests are rejected with `403 Forbidden` if they attempt to access data outside the configured region.

Each region has its own set of environment variables for database, Stellar Horizon, and IPFS configuration:

| Variable                     | Region | Description                                           | Default                                |
| ---------------------------- | ------ | ----------------------------------------------------- | -------------------------------------- |
| `DEFAULT_REGION`             | global | Default region for new tenants                        | `EU`                                   |
| `DB_TYPE_EU`                 | EU     | Database type                                         | `postgres`                             |
| `DB_HOST_EU`                 | EU     | Database host                                         | —                                      |
| `DB_PORT_EU`                 | EU     | Database port                                         | `5432`                                 |
| `DB_NAME_EU`                 | EU     | Database name                                         | `healthy_stellar_eu`                   |
| `EU_DB_URL`                  | EU     | Database connection URL (overrides individual params) | —                                      |
| `DB_URL_EU`                  | EU     | Fallback database URL                                 | —                                      |
| `STELLAR_HORIZON_EU_URL`     | EU     | Stellar Horizon endpoint                              | `https://horizon.eu.stellar.org`       |
| `IPFS_NODES_EU`              | EU     | Comma-separated IPFS node URLs                        | `https://ipfs-eu-1.infura.io:5001`     |
| `DB_TYPE_US`                 | US     | Database type                                         | `postgres`                             |
| `DB_HOST_US`                 | US     | Database host                                         | —                                      |
| `DB_PORT_US`                 | US     | Database port                                         | `5432`                                 |
| `DB_NAME_US`                 | US     | Database name                                         | `healthy_stellar_us`                   |
| `US_DB_URL`                  | US     | Database connection URL (overrides individual params) | —                                      |
| `DB_URL_US`                  | US     | Fallback database URL                                 | —                                      |
| `STELLAR_HORIZON_US_URL`     | US     | Stellar Horizon endpoint                              | `https://horizon.us.stellar.org`       |
| `IPFS_NODES_US`              | US     | Comma-separated IPFS node URLs                        | `https://ipfs-us-1.infura.io:5001`     |
| `DB_TYPE_APAC`               | APAC   | Database type                                         | `postgres`                             |
| `DB_HOST_APAC`               | APAC   | Database host                                         | —                                      |
| `DB_PORT_APAC`               | APAC   | Database port                                         | `5432`                                 |
| `DB_NAME_APAC`               | APAC   | Database name                                         | `healthy_stellar_apac`                 |
| `APAC_DB_URL`                | APAC   | Database connection URL (overrides individual params) | —                                      |
| `DB_URL_APAC`                | APAC   | Fallback database URL                                 | —                                      |
| `STELLAR_HORIZON_APAC_URL`   | APAC   | Stellar Horizon endpoint                              | `https://horizon.apac.stellar.org`     |
| `IPFS_NODES_APAC`            | APAC   | Comma-separated IPFS node URLs                        | `https://ipfs-apac-1.infura.io:5001`   |
| `DB_TYPE_AFRICA`             | AFRICA | Database type                                         | `postgres`                             |
| `DB_HOST_AFRICA`             | AFRICA | Database host                                         | —                                      |
| `DB_PORT_AFRICA`             | AFRICA | Database port                                         | `5432`                                 |
| `DB_NAME_AFRICA`             | AFRICA | Database name                                         | `healthy_stellar_africa`               |
| `AFRICA_DB_URL`              | AFRICA | Database connection URL (overrides individual params) | —                                      |
| `DB_URL_AFRICA`              | AFRICA | Fallback database URL                                 | —                                      |
| `STELLAR_HORIZON_AFRICA_URL` | AFRICA | Stellar Horizon endpoint                              | `https://horizon.africa.stellar.org`   |
| `IPFS_NODES_AFRICA`          | AFRICA | Comma-separated IPFS node URLs                        | `https://ipfs-africa-1.infura.io:5001` |

Example configuration:

```bash
DEFAULT_REGION=EU
DB_HOST_EU=postgres-eu.internal.example.com
DB_PORT_EU=5432
DB_NAME_EU=healthy_stellar_eu
STELLAR_HORIZON_EU_URL=https://horizon.eu.stellar.org
IPFS_NODES_EU=https://ipfs-eu-1.infura.io:5001

DB_HOST_US=postgres-us.internal.example.com
DB_PORT_US=5432
DB_NAME_US=healthy_stellar_us
STELLAR_HORIZON_US_URL=https://horizon.us.stellar.org
IPFS_NODES_US=https://ipfs-us-1.infura.io:5001

DB_HOST_APAC=postgres-apac.internal.example.com
DB_PORT_APAC=5432
DB_NAME_APAC=healthy_stellar_apac
STELLAR_HORIZON_APAC_URL=https://horizon.apac.stellar.org
IPFS_NODES_APAC=https://ipfs-apac-1.infura.io:5001

DB_HOST_AFRICA=postgres-africa.internal.example.com
DB_PORT_AFRICA=5432
DB_NAME_AFRICA=healthy_stellar_africa
STELLAR_HORIZON_AFRICA_URL=https://horizon.africa.stellar.org
IPFS_NODES_AFRICA=https://ipfs-africa-1.infura.io:5001
```

Tenant example:

```json
{
  "region": "EU",
  "strictDataResidency": true
}
```

When a policy violation occurs, the API returns:

```text
403 Forbidden
Tenant data residency policy prohibits access outside the configured region.
```

For local development, the routing service initializes SQLite-backed regional datasources so tests and simulations can verify region selection without a full multi-database deployment.

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Security Headers

Configured via `helmet()` in `src/main.ts` using `src/security/http-security.config.ts`:

- `Content-Security-Policy` — restricts script/style/asset sources to prevent XSS
- `X-Frame-Options: DENY` — blocks clickjacking via iframes
- `X-Content-Type-Options: nosniff` — prevents MIME-type sniffing
- `Strict-Transport-Security` — enforces HTTPS
- `Referrer-Policy: no-referrer` — suppresses referrer leakage
- `X-XSS-Protection: 0` — disables legacy browser XSS filter in favour of CSP

## API Endpoints

The complete route reference is available in the [Swagger UI](/api) when the
application is running and in the generated [OpenAPI specification](docs/openapi.json).
The prefixes below summarize the API by domain; URI-versioned endpoints are
normally served under `/v1` (version-neutral routes are not).

- **Access control and roles:** `/access`, `/users`, `/policies`, `/medical-rbac`, `/role-templates`
- **Administration and operations:** `/admin/*`, `/operator/runbooks`
- **Analytics and governance:** `/analytics/*`, `/governance/reports`, `/financial-reports`
- **Appointments:** `/appointments/*`, `/consultations`, `/doctor-availability`
- **Authentication and identity:** `/auth/*`, `/oauth2`, `/providers`
- **Backup and recovery:** `/backup`
- **Beds, departments, and wards:** `/bed-occupancy`, `/beds`, `/departments`, `/wards`
- **Billing and insurance:** `/billing/*`, `/claims`, `/denials`, `/appeals`, `/insurance`, `/medical-codes`, `/payments`, `/subscriptions`
- **Clinical records:** `/medical-records`, `/clinical-notes`, `/clinical-templates`, `/consents`, `/attachments`
- **Clinical workflow:** `/diagnosis`, `/treatment-plans`, `/procedures`, `/care-templates`, `/outcomes`, `/decision-support`
- **Data governance and validation:** `/api/v1/data-residency`, `/gdpr`, `/research-export`, `/medical-validation`, `/admin/tenants/*/field-validation-rules`
- **EHR import:** `/ehr-import`, `/admin/import`
- **Emergency and incidents:** `/emergency`, `/emergency-medical-info`, `/incidents`
- **FHIR interoperability:** `/fhir/r4`
- **Hospital configuration and registry:** `/hospital-configuration`, `/hospital-registry`
- **Infection control:** `/infection-control`
- **Laboratory:** `/laboratory/*`, `/lab-*`
- **Medical staff:** `/medical-staff`, `/medical-staff/credentials`
- **Medication administration:** `/medication-administration`, `/medication-reconciliation`, `/adverse-reactions`, `/barcode-verification`
- **Monitoring and compliance:** `/health`, `/healthcare-monitoring`, `/clinical-alerts`, `/compliance`, `/dashboard`, `/monitoring`, `/metrics`
- **Notifications:** `/notifications/*`
- **Pathology:** `/pathology/*`
- **Patients and portal:** `/patients`, `/guardians`, `/patient-portal`
- **Pharmacy:** `/pharmacy/*`, `/cds-hooks`
- **Provider-patient coordination:** `/provider-patient/handoffs`
- **Queues and jobs:** `/jobs`, `/dlq`, `/admin/dlq`
- **Reporting:** `/reports`, `/admin/report-schedules`
- **Security and key management:** `/healthcare-security`, `/key-management/kek`, `/admin/key-management`, `/csp-report`, `/admin/api-keys`, `/admin/secret-rotation`
- **Stellar integration:** `/stellar/*`
- **Surgical management:** `/surgical`
- **Telemedicine:** `/telemedicine/*`
- **Tenant management:** `/admin/tenants`, `/admin/tenant-quota`, `/onboarding`
- **Webhooks:** `/webhooks`
- **Platform services:** `/audit`, `/audit-logs`, `/api/versions`, `/consistency`, `/errors`, `/i18n`, `/performance`, `/admin/query-performance`, `/admin/reconciliation`, `/admin/feature-flags`, `/admin/projections`

## Webhooks

Tenants can subscribe to healthcare events (record uploads, access grants, diagnosis
updates, and more). Deliveries are signed with HMAC-SHA256 (`X-Webhook-Signature`),
retried with exponential backoff, replayable from the dead-letter queue, and the
platform also receives signed inbound callbacks from IPFS, Stellar and insurance
payers.

See the [webhook integrator guide](docs/webhooks.md) for the delivery headers,
signature verification snippets (Node and Python), secret rotation semantics, retry
and alerting behaviour, manual replay, the event catalog, and the inbound signing
scheme.

## Postman Collection

Import [`docs/postman/MedChain.postman_collection.json`](docs/postman/MedChain.postman_collection.json). Environments: Local, Testnet, Staging. The collection is generated from OpenAPI; see [how to regenerate the API references](docs/OPENAPI_REGENERATION.md).

## Database Schema

The authoritative database schema is defined by the [TypeORM migrations](src/migrations/)
and corresponding entity definitions in `src/`.

## Error Handling

All non-FHIR errors return a consistent envelope (`statusCode`, `error`, `message`, `code`, `traceId`, `timestamp`, `path`, `details`). Clients should branch on the machine-readable `code` — one of the `AppErrorCode` values — rather than on `message` or the HTTP status. `GlobalExceptionFilter` is the effective handler: it maps errors to codes, logs them with a `traceId`, and withholds internal details (stack traces) from responses. Routes under `/fhir` return an HL7 FHIR `OperationOutcome` instead.

See [`docs/errors.md`](docs/errors.md) for the full error-code catalog (HTTP status, meaning, and retryability for every code), the exception-filter order, sanitization rules, and how `traceId` maps to logs and tracing for support requests.

## Testing

See **[docs/scripts.md](docs/scripts.md)** for the full list of test scripts and their prerequisites.

```bash
npm run test          # Unit tests
npm run test:e2e      # End-to-end tests (requires Docker)
npm run test:cov      # Unit-test coverage
npm run test:all:cov  # Unit and end-to-end coverage
npm run test:compliance  # HIPAA/GDPR compliance tests
```

## Deployment

```bash
npm run build
npm run start:prod
```

Set `NODE_ENV=production`, configure DB credentials, CORS, HTTPS, and logging before deploying.

For operational procedures used during deployment, recovery, and maintenance — key
rotation, migration safety, break-glass review, reconciliation, dead-letter queue
replay, projection rebuilds, and backup/restore — see the
[operator runbooks](docs/runbooks/README.md).

## License

MIT
