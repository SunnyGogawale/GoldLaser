# HTTP security headers

## Where headers are applied

- Express applies the API headers before routing, so they also cover authentication, API errors, and unmatched API routes. Express's `X-Powered-By` header is disabled.
- Vercel applies the same browser security headers to all frontend paths and assets.
- No Nginx or separate CDN configuration is present in this repository. If another proxy/CDN is introduced, configure it to preserve these headers rather than append duplicates.

## Configured headers

| Header | Configuration |
| --- | --- |
| `Content-Security-Policy-Report-Only` | `default-src 'self'; base-uri 'self'; font-src 'self' data:; form-action 'self'; frame-ancestors 'self'; frame-src 'self' blob:; img-src 'self' data: blob:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; upgrade-insecure-requests` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` |
| `Strict-Transport-Security` | `max-age=31536000`, sent by Vercel and by Express only on secure production requests |

The CSP remains report-only so violations can be identified before enforcement. Script execution is restricted to same-origin with no `unsafe-inline` or `unsafe-eval`. Inline style attributes are currently used throughout the React UI, so `style-src 'unsafe-inline'` is an intentional temporary compatibility exception. `blob:` frames are allowed for the application's generated PDF previews; image `data:`/`blob:` sources support embedded company logos and generated content. `frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN` allow only same-origin embedding.

The application uses same-origin API requests in production by default. If `VITE_API_URL` is configured to point to a different origin, add that exact API origin to `connect-src` in both the Vercel and Express policies. Keep `connect-src` limited to the configured API origin; do not use a wildcard scheme or `*`.

HSTS intentionally omits `includeSubDomains` and `preload`, because this repository cannot verify the HTTPS readiness of every subdomain. Vercel serves its configured domains over HTTPS; Express emits HSTS only when the request is recognized as HTTPS (including trusted-proxy deployments configured with `TRUST_PROXY`).

## Validation

The server test suite checks header values, CSP restrictions, and conditional HSTS behavior. For deployment validation, inspect both a frontend document and API responses (including a 401/404) with `curl -I`. Check browser CSP violation reports in report-only mode through representative login, upload, PDF preview, download, and API workflows before changing the policy header to enforcing `Content-Security-Policy`.
