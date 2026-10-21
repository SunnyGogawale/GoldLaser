# GoldFlow Architecture

## 1. System overview

GoldFlow is a React single-page application built with Vite and an Express API
that persists application data in MongoDB through Mongoose.

```text
Browser
  React UI (src/, Mobile/)
       | configured HTTP API requests
       v
Express API (server/)
  middleware -> feature routers -> Mongoose models
       |                              |
       +------------------------------+
                      MongoDB
```

`api/[...path].cjs` provides the deployment adapter for hosting the API through
the serverless platform. `vercel.json` supplies deployment configuration.

## 2. Frontend

- `src/main.jsx` mounts the React application; `src/App.jsx` defines routing,
  authentication-aware page selection, theme persistence, and idle-session
  handling.
- `src/features/<area>/pages/` contains feature screens for authentication,
  customers, vendors, sales, purchases, dashboard, reports, and administration.
- `src/components/` contains reusable interface components.
- `src/utils/` contains shared API, authentication, formatting, validation, and
  domain helpers. Payment credit calculations are centralized in
  `src/utils/creditCalculation.js`.
- `src/config/` contains routes, API endpoint paths, theme/layout tokens, and
  other shared configuration. Shared role/status constants live in
  `src/constants/`.
- `Mobile/src/` contains mobile-focused page components and styles imported by
  relevant feature pages. It is part of the same frontend, not a separate API
  service.

The frontend uses React hooks and local/shared utility modules. Do not assume an
external global state-management framework.

## 3. API and persistence

`server/index.js` configures Express middleware, rate limiting, request parsing,
authentication, routes, error handling, and MongoDB connection lifecycle.
Feature routers live in `server/routes/`; Mongoose schemas and indexes live in
`server/models/`.

Major API areas include:

- Authentication and user profile/administration
- Customers, vendors, products, company settings, and custom fields
- Sales invoices and payments
- Purchase invoices and payments
- Dashboard and reports
- Backups and admin operational monitoring

The payment and invoice models represent sales and purchases separately.
Payment routes validate allocations against pending invoice balances and
persist allocation rows. Keep paired sales/purchase flows consistent without
assuming the two APIs or schemas are interchangeable.

## 4. Request and session flow

1. The frontend reads the configured API origin from `src/config/urls.js` and
   endpoint paths from `src/config/api-endpoints.js`.
2. Shared `apiFetch` behavior attaches the current bearer token only to requests
   for the configured API origin and preserves caller headers.
3. Express applies security headers and API rate limiting before route
   processing. Authentication routes are mounted before the protected API
   middleware; protected business routes require valid authentication.
4. Admin authorization is enforced by server middleware on restricted endpoints.
   Client-side checks control navigation/presentation only.
5. Routes validate input and perform domain operations through Mongoose models.
   Errors flow through the shared server error handler, with sensitive details
   sanitized.

See [`docs/AUTHENTICATION.md`](./docs/AUTHENTICATION.md),
[`docs/RATE_LIMITING.md`](./docs/RATE_LIMITING.md), and
[`docs/SECURITY_HEADERS.md`](./docs/SECURITY_HEADERS.md) for implementation
details.

## 5. Configuration and deployment

- Frontend API origins are selected by Vite mode. See
  [`CONFIGURATION.md`](./CONFIGURATION.md).
- Server secrets and MongoDB connection settings belong in server/deployment
  environment configuration, never in `VITE_*` variables or committed docs.
- MongoDB index declarations and the safe index installer are documented in
  [`docs/MONGODB_INDEXES.md`](./docs/MONGODB_INDEXES.md).
- Database monitoring and deployment topology constraints are described in
  [`docs/DB_MONITORING.md`](./docs/DB_MONITORING.md).

The project does not establish a separate service layer or message queue as a
required architectural component; follow the existing route/model/helper
structure when extending it.

## 6. Operational behavior

- The API health endpoint reports database readiness.
- Mongo connection options, monitoring, bounded reconnect behavior, and graceful
  shutdown are implemented in the server.
- Rate-limit data is shared through MongoDB and has retention/index
  configuration.
- The configured deployment can use a standalone MongoDB topology; do not
  assume replica-set features or claim horizontal Mongo distribution unless the
  target environment has been verified.

## 7. Testing boundaries

- Frontend production build: `npm run build`
- Project lint: `npm run lint`
- Backend tests: `npm run test:server`
- Database index ensure/explain: `npm run db:indexes` and
  `npm run db:indexes:explain` against an intentionally configured database.

Use focused tests and avoid running database-mutating commands against
unconfirmed production or shared environments.
