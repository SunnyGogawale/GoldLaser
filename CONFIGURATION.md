# Shared application configuration

Reusable frontend configuration lives in `src/config/`, and shared role,
permission, and status values live in `src/constants/`.

## Environment URLs

The frontend selects its API origin by Vite mode:

- Development: `VITE_API_URL`, falling back to `http://localhost:5001`.
- Staging: `VITE_STAGING_API_URL`, then `VITE_API_URL`, then same-origin.
- Production: `VITE_PRODUCTION_API_URL`, then `VITE_API_URL`, then same-origin.

Use `.env.staging` and `.env.production` (or deployment environment settings) to
provide mode-specific values. Only public API origins belong in frontend
environment variables; never put credentials or private keys in `VITE_*`
variables. API paths are defined in `src/config/api-endpoints.js`.

## Configuration modules

- `colors.css` and `colors.js`: existing light/dark theme variables and
  JavaScript references to those variables.
- `typography.css` and `typography.js`: the existing font family and shared
  font size/weight tokens.
- `layout.css`, `spacing.js`, `dimensions.js`, and `z-index.js`: shared spacing,
  layout dimensions, and stacking-level tokens. `breakpoints.js` records the
  existing responsive breakpoint values for JavaScript consumers.
- `text.js` and `validation-messages.js`: shared navigation labels and exact
  existing validation strings.
- `routes.js`, `urls.js`, and `api-endpoints.js`: route paths, environment-aware
  origins, and API paths.
- `date-format.js` and `app-config.js`: shared date, pagination, session-timeout,
  and debounce defaults.
- `src/constants/`: role, permission, and status values.

The current frontend uses role-based checks without a separate set of
permission identifiers, so authorization remains expressed through the existing
role checks rather than adding unused permission values.

Feature-specific labels, CSS values, responsive media-query values, inline
styles, and one-off dimensions remain local when extracting them would add
indirection without providing a shared value or risk changing the existing
appearance or behavior.
