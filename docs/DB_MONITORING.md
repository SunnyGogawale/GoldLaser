# Database Pool Monitoring

## Current Topology

The configured MongoDB endpoint returned a standalone topology with one advertised node. The application therefore uses the primary read preference and reports one database node; it does not claim replica-set or shard load distribution. If deployed behind Vercel, API requests are distributed by Vercel's serverless platform. This project does not add a separate reverse proxy or MongoDB cluster.

Replica sets and sharded clusters are supported by the MongoDB driver. Set `MONGODB_READ_PREFERENCE` to a supported value only after validating replica-set topology and read consistency requirements. The default is `primary`; writes remain primary-routed. `secondaryPreferred` and other non-primary values can return stale data and have no benefit on the currently observed standalone server.

## Pool And Lifecycle

Copy `server/.env.example` to a local `server/.env`. Set production values in the deployment's secret/configuration manager; do not commit `.env` or production connection strings. Pool size is per application process and per MongoDB server. With multiple Vercel instances, the potential aggregate connections can approach `instance count × maxPoolSize × server count`, so configure `MONGODB_MAX_POOL_SIZE` against the MongoDB connection limit and expected serverless concurrency. `MONGODB_MIN_POOL_SIZE=0` avoids holding idle connections for cold processes.

Mongoose's singleton connection is reused across requests and hot reloads. The driver handles recovery after an established connection drops; an initial long-running-server connection failure retries with bounded exponential backoff. Serverless requests can retry connection initialization on a later invocation. `/api/health` returns only readiness (200 or 503). SIGTERM/SIGINT stop the monitor and close the HTTP and Mongo connections gracefully.

## Collected Data And Limits

The collector uses MongoDB driver command, connection-pool, and heartbeat monitoring events. It does not store command text, query parameters, credentials, connection strings, or tokens. Command counts and latency are process-local since that process started. Pool/node metrics are sampled into one upserted snapshot per process; the dashboard combines recent snapshots from currently reporting instances. Snapshots older than `DB_MONITORING_ACTIVE_WINDOW_MS` are ignored, and graceful shutdown records an instance-stop event. Crashed or frozen serverless instances can remain visible until their last snapshot ages out.

Significant pool/node/operation failures are rate-limited by `DB_ACTIVITY_MAX_EVENTS_PER_MINUTE`; snapshots are written at `DB_MONITORING_SNAPSHOT_INTERVAL_MS`. The activity TTL is configured by `DB_ACTIVITY_RETENTION_DAYS` and requires MongoDB index support. Install the declared TTL and filter indexes before production traffic with `npm run db:indexes`. The installer does not alter existing indexes; changing retention after index creation requires a reviewed TTL-index migration.

Health for replica-set members is based on driver heartbeat events. A successful `hello` identifies topology and confirms the responding member, but cannot establish that every advertised member is healthy. For sharded deployments behind `mongos`, member counts are reported as unavailable because shard membership is not exposed by the router's `hello` response. Missing telemetry is returned/displayed as `N/A`.

The protected endpoints are `/api/admin/load-balancing/health`, `/metrics`, and `/activities`. API access verifies the bearer token and current active admin role from MongoDB; the client-side role check only controls navigation. Activity filtering is bounded to 100 records per page. Error detail is redacted and only returned to admins.

## Verification

`npm run test:server` runs the backend suite, including pool configuration, authorization, index declarations, and existing business-logic tests. `npm run db:indexes:explain` performs bounded `executionStats` plan checks against the configured database. During implementation, a localhost standalone returned one database node and `IXSCAN` for the monitoring's target query shapes. Eight concurrent local reads were counted by driver events. No replica-set failover or production load test was performed because the configured deployment is a one-node standalone; node failure injection would interrupt the active local database and was not attempted.