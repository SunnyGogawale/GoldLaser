# API authentication

## Token transport

The browser stores the short-lived access JWT in `sessionStorage` and sends it only in the `Authorization: Bearer <token>` header to the configured API origin. The shared `apiFetch` helper applies the header to API requests, preserves caller-supplied headers, and does not attach credentials to other origins. The token is not placed in route paths, query parameters, or navigation state. No current workflow requires a URL token.

`sessionStorage` is JavaScript-readable and therefore does not provide the XSS protection of an HttpOnly cookie. The API uses Bearer headers rather than cookies, so browser requests do not require cookie-based CSRF handling. Production deployments should serve the app and API over HTTPS and maintain strict XSS defenses.

## Validation and expiry

JWTs are signed with `JWT_SECRET`, accepted using the HS256 algorithm, and issued with a one-hour expiry. Protected API requests require a valid Bearer token, an existing active user, and a login-history session that has not been logged out. Missing, invalid, expired, sessionless, inactive-user, and revoked-session tokens receive HTTP 401. A 401 from the client API helper clears the local auth session and returns the user to login.

## Route access

| Route(s) | Access |
| --- | --- |
| `POST /api/auth/signin`, `POST /api/auth/signup` | Public; sign-up always creates a standard user regardless of supplied role fields |
| `GET /api/health` | Public health status only |
| `/api/auth/logout`, `/api/auth/me`, `/api/auth/me/password` | Valid authenticated user |
| `/api/company-settings`, customers, vendors, invoices, payments, purchases, reports, dashboard, products, custom fields, and other API routes | Valid authenticated user |
| `/api/users/me` and profile/password operations | Valid authenticated user |
| User administration, backup operations, load-balancing and rate-limit monitoring | Existing admin middleware continues to enforce admin authorization |

There are no URL-token routes. File downloads use authenticated API requests with a Bearer header followed by a browser blob download, not a tokenized link.
