# GoldFlow Product Requirements Document

## 1. Purpose

GoldFlow is a web-based jewelry business management application. It provides
authenticated workflows for managing customers, vendors, sales and purchase
invoices, payments, operational reporting, and administrative settings.

This document describes the capabilities present in the repository. It is not a
commitment to unimplemented functionality. Older material in
[`Project_Documentation.md`](./Project_Documentation.md) refers to a high-fidelity
prototype and planned backend; it does not describe the current product
completely.

## 2. Users and access

- **Standard users** use the business workflows available to authenticated
  accounts.
- **Administrators** have additional user, backup, and operational monitoring
  workflows. The API is authoritative for authorization; hiding a page or menu
  in the frontend is not an authorization boundary.
- Public authentication workflows include sign-in and sign-up. Other application
  routes require an authenticated session. Admin-only screens have additional
  role checks.

The exact role and permission vocabulary is maintained in
[`src/constants/`](./src/constants/), not duplicated as new literals in features.

## 3. Product capabilities

### Authentication and session

- Sign in, register, and recover account access.
- Use short-lived bearer-token authentication for API requests.
- End the session on logout, unauthorized API response, or configured inactivity
  timeout.

### Business records and transactions

- Maintain customer and vendor records, including supported custom fields and
  statements.
- Create and manage sales invoices and related customer payments.
- Create and manage purchase invoices and related vendor payments.
- Search, paginate, view details/history where provided, and use attachment or
  document workflows where the relevant screen supports them.
- Maintain products and company settings through the corresponding workflows.

### Payment and invoice allocation

- Payment forms display pending invoices for the selected customer or vendor.
- Users may associate payment amounts with selected invoice rows; allocations
  are validated against invoice balances by the existing application/API rules.
- Payment amount, selected invoice allocations, and available credit are
  distinct values. Credit behavior is implemented in shared calculation helpers
  and payment endpoints; screens must not invent a parallel calculation.
- A payment requires a positive amount or selected invoice(s), subject to
  existing validation. Selected payment amounts may not exceed invoice balances.
- Sales and purchase payment flows should remain behaviorally consistent where
  their established workflows are equivalent.

### Dashboard, reporting, and administration

- Dashboard and reports provide business summaries and views backed by API
  endpoints.
- Administrators can manage users, backups, products, and operational
  observability pages, including database/load-balancing and rate-limit
  monitoring.

## 4. Core requirements

1. Protect business records behind authentication and enforce authorization on
   the server.
2. Preserve existing sales and purchase rules, validations, calculations,
   credit allocation, and API contracts when changing the UI.
3. Keep data entry usable on desktop and mobile, with feedback for loading,
   validation, success, and failure states.
4. Make displayed payment and invoice values consistent with persisted
   allocations and the shared calculation utilities.
5. Respect configured light/dark themes and existing responsive behavior.
6. Keep operational and security telemetry appropriately bounded and avoid
   logging secrets or unnecessary request data.

## 5. Quality requirements

- **Reliability:** surface actionable errors using established API/error/toast
  patterns; do not silently turn failed operations into success.
- **Security:** do not expose secrets in frontend code, routes, or documentation.
  Treat frontend role checks as presentation only.
- **Compatibility:** preserve existing route paths, persisted data shape, and
  established API behavior unless a separately scoped change requires otherwise.
- **Maintainability:** reuse existing feature patterns, configuration,
  constants, and helpers; keep documentation aligned with the code.
- **Verification:** use the narrowest relevant lint/test/build checks, then expand
  validation only when needed.

## 6. Out of scope

This PRD does not authorize replacing the current data model, changing payment
accounting rules, redesigning authentication, or implementing new modules. Any
new business policy, roadmap commitment, or behavioral change requires a
separate product decision.

## 7. Success criteria

- Existing workflows can be completed without regressions in invoice/payment
  records, balances, or authorization.
- Changes satisfy their explicit acceptance criteria and are validated with
  project tooling.
- Documentation describes observed behavior and clearly labels proposed work.
