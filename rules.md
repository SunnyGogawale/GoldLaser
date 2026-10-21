# Development Rules

These rules capture the project's existing implementation patterns and the
constraints that should guide changes. They do not introduce new business
policies.

## 1. Scope and behavior

- Make targeted changes that satisfy the requested outcome; do not modify
  unrelated features.
- Preserve established business logic, persistence shapes, API contracts,
  calculations, credit allocation, and validation unless the request explicitly
  changes them.
- Before changing domain behavior, inspect the relevant UI, helpers, routes,
  models, and tests. Search for existing helpers and parallel sales/purchase
  behavior first.
- Keep sales and purchase workflows aligned where appropriate, while respecting
  their distinct models and endpoints.
- Do not infer product requirements from stale documentation. Verify behavior in
  current code and label proposals as proposals.

## 2. Frontend conventions

- Use the existing React functional component and hooks patterns.
- Reuse shared components, helpers, endpoint definitions, configuration, and
  constants. Avoid adding one-off abstractions or duplicated calculation logic.
- Keep responsive/mobile behavior, loading states, accessibility labels, and
  theme support consistent with adjacent screens.
- Preserve existing validation and error presentation. Do not silently swallow
  failures or show success-shaped fallback results.
- Avoid `any`-style escape hatches and unnecessary type coercion; validate values
  according to established patterns.

## 3. API, security, and persistence

- Validate all business data at the API boundary. UI restrictions are not a
  substitute for server-side validation or authorization.
- Keep admin checks on the server. Client-side role checks are only for
  navigation and presentation.
- Use the shared authentication/request utilities. Do not put tokens or
  credentials in URLs, logs, code, or documentation.
- Keep secrets out of `VITE_*` variables and commits. Use local environment
  files or deployment secret management as documented in
  [`CONFIGURATION.md`](./CONFIGURATION.md).
- Do not change Mongo indexes or data shape casually. Follow the index
  installation and migration guidance in
  [`docs/MONGODB_INDEXES.md`](./docs/MONGODB_INDEXES.md).

## 4. Documentation conventions

- Document current behavior only when verified against code or authoritative
  existing documentation.
- Clearly distinguish current behavior, assumptions, and proposed future work.
- Keep operational instructions safe: identify whether a command reads,
  mutates, or requires a configured database.
- Never copy secrets, credentials, recovery codes, or production data into docs.
- Update the nearest relevant documentation when a change affects user-visible
  behavior, configuration, architecture, or operations.

## 5. Validation workflow

1. Inspect the target files, neighboring patterns, and existing worktree changes.
2. Implement a coherent, minimal change; retain unrelated user modifications.
3. Run the smallest relevant check (focused lint/test/build) and inspect the
   diff.
4. Run broader checks only when required by impact or focused failures.
5. Report what changed and clearly disclose checks that were not run or any
   remaining warnings.

Available project commands:

| Purpose | Command |
| --- | --- |
| Start frontend dev server | `npm run dev` |
| Production frontend build | `npm run build` |
| Lint repository | `npm run lint` |
| Backend tests | `npm run test:server` |
| Ensure declared database indexes | `npm run db:indexes` |
| Explain representative query plans | `npm run db:indexes:explain` |

Index commands require deliberate target-database configuration; do not run them
against an unknown or production database as a routine test.
