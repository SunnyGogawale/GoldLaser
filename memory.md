# Project Memory

## What this project is

- **Product:** GoldFlow, a jewelry-business management application.
- **Frontend:** React + Vite, JavaScript/JSX, React Router.
- **Backend:** Express + Mongoose, with MongoDB persistence.
- **Deployment:** Vite frontend and a serverless API adapter are configured in
  the repository; deployment-specific details belong in the deployment
  environment, not here.
- **Primary source areas:** `src/features/`, `src/components/`, `src/utils/`,
  `src/config/`, `src/constants/`, `server/routes/`, `server/models/`, and
  `Mobile/src/`.

## Important source-of-truth locations

- Route registration and auth-aware frontend routing: `src/App.jsx`,
  `src/config/routes.js`.
- API origins and endpoint paths: `src/config/urls.js`,
  `src/config/api-endpoints.js`.
- Shared auth request/storage behavior: `src/utils/authStorage.js` and
  `docs/AUTHENTICATION.md`.
- Payment credit calculations: `src/utils/creditCalculation.js`.
- Server middleware and route mounting: `server/index.js`.
- Mongo schemas/indexes: `server/models/` and
  `docs/MONGODB_INDEXES.md`.
- Theme/layout: `src/config/` styles and `src/index.css`.

## Domain reminders

- Sales and purchase invoices/payments are paired but separate workflows, APIs,
  and models. Inspect both when implementing a shared behavior.
- Payment cash amount, invoice allocations, and available credit are separate
  concepts. Reuse current helpers and server validation; do not recreate or
  reinterpret the accounting rules from UI labels.
- Client-side role checks are not authorization. The API must continue enforcing
  access requirements.
- Existing product behavior is authoritative over stale summaries. In
  particular, [`Project_Documentation.md`](./Project_Documentation.md) still
  contains claims that the backend is planned and describes demo functionality;
  verify claims against current source before relying on them.

## Development commands

Run from the repository root:

```sh
npm run dev
npm run build
npm run lint
npm run test:server
```

Database index commands (`npm run db:indexes` and
`npm run db:indexes:explain`) require deliberate database configuration and
should not be used casually against production or shared data.

## Safety and maintenance

- Never put credentials, recovery information, production records, or private
  environment values in tracked documentation.
- Do not treat local environment files, backups, generated `dist/`, or dependency
  caches as documentation sources.
- Before changes, inspect `git status`; retain unrelated worktree modifications.
- Keep this file limited to durable project context. Update it when architecture
  or verified workflow commands materially change; do not use it as a running
  task log or a substitute for tests.

## Current documentation map

- [`PRD.md`](./PRD.md): product scope and requirements.
- [`Architecture.md`](./Architecture.md): system structure and request flow.
- [`rules.md`](./rules.md): development and safety conventions.
- [`phases.md`](./phases.md): reusable delivery framework; not an approved
  release schedule.
- [`design.md`](./design.md): UI patterns and design tokens.
- [`CONFIGURATION.md`](./CONFIGURATION.md) and [`docs/`](./docs/): configuration
  and operational details.
