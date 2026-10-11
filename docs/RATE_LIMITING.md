# API Rate Limiting

## Enforcement and Storage

The Express API applies a fixed-window policy before body parsing and route handlers. The authentication policy keys by client IP so invalid-login attempts cannot rotate identities; authenticated requests on other APIs key by the verified JWT user ID, while guests key by IP. IP values are HMAC-SHA256 identifiers in both the counter and activity collections; raw IP addresses are not stored. Set `RATE_LIMIT_IP_HASH_SECRET` to a dedicated, stable secret so IP filters continue to match after JWT secret rotation.

MongoDB atomic `findOneAndUpdate` pipeline counters are the shared store across application instances. Successful requests increment an aggregate window counter, not a per-request activity document. Denials are grouped by policy window, user/IP identity, and normalized endpoint; `eventCount` records the number of denied requests in that group. This keeps audit writes proportional to affected identities/endpoints rather than every allowed API call. Both collections use TTL indexes; MongoDB TTL cleanup is asynchronous, so expiration is approximate. If MongoDB is unavailable, enforcement and audit writes fail open so unrelated request handling is not blocked; Mongo-dependent endpoints will still follow their existing database behavior.

The configured `TRUST_PROXY` value controls Express proxy trust. Leave it unset unless the service is behind a trusted proxy; otherwise configure the exact trusted proxy hop count or subnet. Never trust arbitrary client-supplied forwarding headers. In a multi-instance deployment, set `APP_INSTANCE_ID` uniquely for each instance if the default hostname/PID identifier is not unique.

## Default Policies

| Policy | Scope | Default |
| --- | --- | --- |
| `authentication` | All `/api/auth` requests, keyed by IP | 10 requests per 15 minutes |
| `resource` | `/api/reports`, `/api/backups`, `/api/dashboard` | 60 requests per minute |
| `monitoring` | Rate-limit monitoring APIs | 60 requests per minute |
| `general` | Other `/api` routes | 300 requests per minute |

Each policy can be changed with a positive integer environment value. Window values are milliseconds and are capped at 24 hours; limits are capped at 10,000.

| Environment variable | Default |
| --- | --- |
| `RATE_LIMIT_AUTH_MAX` | `10` |
| `RATE_LIMIT_AUTH_WINDOW_MS` | `900000` |
| `RATE_LIMIT_RESOURCE_MAX` | `60` |
| `RATE_LIMIT_RESOURCE_WINDOW_MS` | `60000` |
| `RATE_LIMIT_MONITORING_MAX` | `60` |
| `RATE_LIMIT_MONITORING_WINDOW_MS` | `60000` |
| `RATE_LIMIT_GENERAL_MAX` | `300` |
| `RATE_LIMIT_GENERAL_WINDOW_MS` | `60000` |
| `RATE_LIMIT_IP_HASH_SECRET` | Falls back to `JWT_SECRET` (then a development-only constant) |
| `RATE_LIMIT_ACTIVITY_RETENTION_DAYS` | `90` days, clamped to 1-3650 |
| `RATE_LIMIT_COUNTER_RETENTION_DAYS` | `90` days, clamped to 1-3650 |
| `APP_ENV` | Explicit valid value; otherwise `production` only when `NODE_ENV=production`, else `development` |
| `APP_INSTANCE_ID` | Hostname and process ID |
| `TRUST_PROXY` | Unset; Express proxy trust disabled |

Set `APP_ENV=staging` explicitly for staging deployments. Production deployments should set strong JWT and IP-hash secrets, a correct trusted-proxy configuration, and stable per-instance identifiers.

## Activity API

All endpoints require a valid active Admin account through the existing `requireAdmin` middleware, and monitoring requests receive their own rate-limit policy.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/admin/rate-limit-activities/apis` | Runtime-discovered Express routes with request, outcome, and current-window metrics; supports search, method, module, access role, status, and pagination |
| `GET /api/admin/rate-limit-activities` | Newest-first filtered records; `page` and `limit` (10, 25, 50, or 100); filters: `search`, `fromDate`, `toDate`, `method`, `activityType`, `userRole`, `policyName`, and `ipAddress` |
| `GET /api/admin/rate-limit-activities/stats` | Stored counter totals, distinct affected users, active restrictions, and top endpoints; accepts date and policy filters |
| `GET /api/admin/rate-limit-activities/live` | Admin-only Server-Sent Events stream with `Last-Event-ID` replay; Mongo change streams fan events across instances when supported |
| `GET /api/admin/rate-limit-activities/:id` | One stored event group |
| `GET /api/admin/users/:userId/rate-limit-activities` | Paginated per-user event history |
| `GET /api/admin/rate-limit-activities?export=csv` | CSV of filtered records, capped at 10,000 rows |

The `ipAddress` field and CSV IP identifier are hashed, not raw addresses. Supply the raw address in the authorized `ipAddress` filter; the server hashes it before querying. Request/response bodies, credentials, cookies, and access tokens are never stored by the limiter. The UI performs an additional role check for navigation, while server authorization remains authoritative.

Request completions are collected in short in-process batches, then stored in grouped activity records and per-route metrics on the shared counter windows. Each window bucket retains a bounded event replay list. If MongoDB change streams are unavailable, the stream continues with this instance's events and returns a warning; the Admin page reconnects with exponential backoff and uses periodic historical refresh while disconnected.

## Index Deployment and Explain

Rate-limit models participate in the normal production index installer. After configuring `MONGODB_URI`, deploy with `npm run db:indexes`; this creates missing declared indexes without dropping existing ones. Run `npm run db:indexes:explain` against the same database and inspect the rate-limit `executionStats` entries (`winningPlan` must include `IXSCAN`; review `totalKeysExamined` and `totalDocsExamined` for representative data). Query-plan tests in `server/__tests__/mongoIndexes.test.js` verify the declared compound, unique, partial, and TTL index shapes without requiring a live database.

Counter windows are retained for 90 days by default to support the dashboard's request totals; grouped activity records use the same default operational/audit horizon. Align both retention settings with your organization's audit policy. TTL deletion is automatic and not a legal hold mechanism.