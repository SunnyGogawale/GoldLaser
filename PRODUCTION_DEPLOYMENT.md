# Production Deployment

Vite reads workspace-root `.env*` files at build time, and Express reads those same files at runtime. The root file is the common configuration; `server/.env*` files are backend-only fallbacks. Vite exposes only `VITE_*` variables to browser assets, so never use that prefix for secrets. In production, supply database credentials, JWT secrets, and other private values through backend runtime variables or a secret manager, use separate credentials per environment, and rotate anything exposed. Keep database ports private, configure exact CORS origins, and serve the API over HTTPS.

## Environment files

- Root `.env.example`: common variable-name template.
- Root `.env.development.example`: local frontend and backend profile; copy it to root `.env.development`.
- Root `.env.production.example`: safe production profile template; use it as a checklist, and keep populated `.env.production` out of Git.
- `server/.env.example`: optional backend-only fallback template.

The repository intentionally does not include a populated `.env.production`. `.gitignore` ignores real `.env` files while allowing the named templates.

## Frontend-safe variables

Set these in the shared root env file or frontend host's build settings:

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | API origin, such as `https://api.example.com`; leave empty for same-origin requests; do not append `/api`. |
| `VITE_APP_NAME` | Product name used in the document title and metadata. |
| `VITE_APP_ENV` | Public environment label embedded in the document metadata. |
| `VITE_BACKUP_REFRESH_MS` | Backup page refresh interval in milliseconds; defaults to `15000`. |
| `VITE_DEV_HOST`, `VITE_DEV_PORT`, `VITE_DEV_STRICT_PORT` | Local Vite server bind settings. |

Vite embeds `VITE_` values in browser assets. They must not contain credentials, database URLs, or private keys. Rebuild/redeploy the frontend after changing them.

## Backend-only variables

Set these in the shared root env file for local development, or on the Express server using runtime environment variables or a secret manager in production:

| Variable | Required / default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | Set to `production` | Enables production cookie behavior. |
| `PORT` | Required | HTTP listener port. Use the port supplied by the host. |
| `MONGODB_URI` | Required for hosted data | Full MongoDB connection URI including database name and credentials. |
| `JWT_SECRET` | Required | Signing and verifying authentication sessions. Generate a unique random secret. |
| `CORS_ORIGINS` | Required for cross-origin frontend | Comma-separated exact frontend origins; do not use `*`. Legacy aliases `CLIENT_ORIGIN` and `FRONTEND_ORIGIN` are supported but not needed. |
| `REDIS_URL` | Optional | Redis connection URL. If missing or unavailable, cache operations fail open and requests continue without Redis. |
| `AUTH_COOKIE_SAME_SITE` | Defaults to `lax` | Cookie SameSite mode. Use `none` only when frontend/API are cross-site; HTTPS is then required. |
| `AUTH_COOKIE_SECURE` | Defaults to true in production | Secure-cookie override; production mode still forces Secure cookies. |
| `AUTH_COOKIE_NAME` | Optional | Cookie name; production default is `__Host-goldflow_session`. The `__Host-` prefix requires Secure, path `/`, and no cookie domain. |
| `AUTH_COOKIE_MAX_AGE_MS` | Defaults to one hour | Cookie lifetime in milliseconds. |
| `AUTH_COOKIE_DOMAIN` | Optional | Cookie domain; leave empty for the secure `__Host-` cookie. |
| `JWT_EXPIRES_IN` | Defaults to `1h` | JWT expiry accepted by `jsonwebtoken`, for example `1h`. |
| `BCRYPT_SALT_ROUNDS` | Defaults to `10` | Password hash work factor; production template sets `12`. |
| `MONGODB_DB_NAME` | Optional | Overrides the database name embedded in `MONGODB_URI`. |
| `CACHE_ENABLED` | Defaults to true | Master application-cache switch. |
| `REDIS_CACHE_ENABLED` | Defaults to true only when `REDIS_URL` exists | Enables the Redis cache adapter. When explicitly true, `REDIS_URL` is required. |
| `CACHE_DEFAULT_TTL` | Defaults to `120` seconds | Product-list Redis cache TTL. |
| `CACHE_VERSION_TTL` | Derived from cache TTL | Redis cache-version key TTL. |
| `CACHE_PREFIX` | Optional | Namespace prefix for Redis keys. |
| `TRUST_PROXY` | Defaults to `1` | Express proxy trust setting; adjust to the number/type of trusted proxies. |
| `REQUEST_BODY_LIMIT` | Defaults to `200mb` | Express JSON and URL-encoded request size limit. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_FULL_NAME` | Required only for admin bootstrap script | Credentials/name for `server/scripts/create_admin_v2.js`; never log or commit the password. |
| `BACKUP_STORAGE_PATH` | Optional | Local directory for database backup files. |
| `BACKUP_RETENTION_DAYS` | Defaults to `8` | Backup age retention. |
| `BACKUP_KEEP_LATEST_COUNT` | Defaults to `10` | Maximum number of recent backups retained. |
| `BACKUP_MAX_COUNT` | Defaults to `25` | Hard upper cap on retained backup count. |
| `BACKUP_INTERVAL_HOURS` | Defaults to `0` | Scheduled backup interval in hours; zero disables the scheduler. |
| `BACKUP_INTERVAL_MINUTES` | Defaults to `0` | Scheduled backup interval in minutes; zero disables the scheduler. |
| `MONGODUMP_PATH` | Optional | Absolute path to `mongodump` when it is not on `PATH`. |
| `MONGORESTORE_PATH` | Optional | Absolute path to `mongorestore` when it is not on `PATH`. |

The backend does not currently read separate MongoDB host variables; the database name may be included in `MONGODB_URI` or overridden with `MONGODB_DB_NAME`. Cookie HttpOnly behavior and path are fixed securely in code. Browser caching for API responses remains `private, no-store`; CDN caching is configured by Vercel for built assets, not by an application URL variable.

## Hosting setup

1. **MongoDB:** create a production database/user, restrict network access to the backend host, and put the full URI in backend-only `MONGODB_URI`. Include the database name in the URI. Do not point it at the web server IP unless MongoDB runs there.
2. **Redis:** provision Redis and set `REDIS_URL` in the backend runtime environment, then set `REDIS_CACHE_ENABLED=true`. No separate host/port/password variables are read by this project. Redis caching currently applies to the product-list endpoint; configure TTL and key prefix using the cache variables above.
3. **Frontend API URL:** set `VITE_API_URL` once in the shared profile to the API origin without `/api`, such as `http://localhost:5001` locally or `https://api.example.com` in production. Leave it empty only when using a same-origin `/api` rewrite. Rebuild the frontend after changing it.
4. **CORS:** set `CORS_ORIGINS` to the exact frontend origin, including scheme and any non-default port. Multiple origins are comma-separated. Credentialed requests cannot use wildcard origins.
5. **HTTP-only cookies:** cookies are HttpOnly in code and are never exposed to browser storage. In production they are Secure. Serve frontend and API over HTTPS; use `AUTH_COOKIE_SAME_SITE=none` only for genuinely cross-site deployments, also over HTTPS.
6. **CDN:** Vercel applies immutable one-year caching to built `/assets/` files via `vercel.json`. There is no `CDN_URL` or CDN toggle in application code. Keep authenticated APIs off shared caches.
7. **Backups/uploads:** backup and restore files use server-local storage configured by `BACKUP_STORAGE_PATH`; this project does not currently use S3, Cloudinary, or another object-storage provider. Install MongoDB Database Tools on the backend host or configure their paths. Persistent disks are required if backups must survive server replacement.
8. **Scheduled jobs:** the built-in backup scheduler runs after MongoDB connects. It is disabled when both backup intervals are zero. Configure one interval only after confirming MongoDB tools and persistent storage are available. No BullMQ/queue configuration is used.
9. **Email and external APIs:** no SMTP, payment provider, OAuth provider, Firebase, Cloudinary, or AWS storage integration is configured in the current application, so none is included here.

## Verification

- Confirm the backend starts with the intended `PORT` and connects to the intended MongoDB database; inspect host logs without printing connection strings.
- Confirm the frontend requests the configured API origin and that browser devtools show successful `/api` requests.
- Sign in over HTTPS, reload the page, and confirm the session cookie is present with `HttpOnly`, `Secure`, and the expected `SameSite` attribute. Confirm it is absent from `localStorage` and `sessionStorage`.
- Send a request from the configured frontend origin and confirm the response allows that exact origin with credentials. A different origin should not receive credentialed access.
- With `REDIS_URL` configured, inspect Redis metrics/logs and request the product list more than once. Temporarily unavailable Redis should not break API responses.
- Create and restore a test backup using an admin account, then confirm files appear under `BACKUP_STORAGE_PATH` and persist across a deployment if required.
- Run `npm --prefix server test` for backend checks. Do not print `.env` values in logs or diagnostic output.

## Existing secret warning

An existing comment in the local `server/.env` was found to contain a MongoDB credential. Treat it as exposed if it was ever valid: rotate the database user's password, remove the old URI from any tracked history as appropriate, and keep the replacement only in a secret manager or ignored `server/.env` file. Do not copy that value into any template.