# Cookie Authentication

The API stores its signed session JWT in an HttpOnly cookie named `__Host-goldflow_session` in production and `goldflow_session` in development. The cookie is Secure in production, scoped to `/`, and is never included in JSON responses or browser storage.

By default, `AUTH_COOKIE_SAME_SITE=lax`, which is appropriate when the frontend and API are same-site (including local development on different localhost ports). For a frontend and API on different sites, configure:

```env
AUTH_COOKIE_SAME_SITE=none
CORS_ORIGINS=https://your-frontend.example.com
```

`SameSite=None` forces Secure cookies, so both frontend and API must use HTTPS. `CORS_ORIGINS` is a comma-separated allowlist of exact frontend origins. Set `VITE_API_URL` to the API origin when it is not served from the frontend origin. Requests use credentials; do not reintroduce bearer-token storage or response fields.