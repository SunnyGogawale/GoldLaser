# Delivery Phases

This is a practical framework for planning future work, not a claim that the
project has an approved roadmap or scheduled releases. Prioritize with the
product owner based on user need and operational risk.

## Phase 1: Establish the baseline

**Goal:** Understand the current behavior before making a change.

- Identify the relevant screen, shared helpers, API routes, models, and tests.
- Confirm expected user roles, data flow, validation, and current behavior.
- Check the worktree and preserve unrelated user changes.
- Record any ambiguity that could change business behavior and request a
  decision before implementation.

**Exit criteria:** Scope and acceptance criteria are clear; related existing
behavior and files are known.

## Phase 2: Make a focused change

**Goal:** Deliver the smallest complete implementation.

- Follow existing feature patterns and use established helpers.
- Preserve API and persisted-data compatibility.
- Update paired sales/purchase behavior when the requested capability applies to
  both.
- Add/update focused tests when an existing test layer covers the behavior.
- Update directly related documentation.

**Exit criteria:** The change meets its acceptance criteria without unrelated
behavior changes.

## Phase 3: Verify and review

**Goal:** Confirm behavior and integration quality.

- Run focused lint/tests first, then build or broader suites as appropriate.
- Check boundary cases and validation behavior required by the request.
- Review the final diff for accidental changes, sensitive data, and omissions.
- Confirm any database commands target an explicitly intended environment.

**Exit criteria:** Checks pass or known pre-existing failures/warnings are
reported precisely; the diff is scoped and reviewable.

## Phase 4: Release and observe

**Goal:** Deploy safely and confirm operational health.

- Use the established deployment configuration and environment-specific API
  origins.
- Deploy schema/index changes only through the documented process and with
  target-database review.
- Verify authentication, affected user flows, API readiness, and relevant
  monitoring after release.
- Roll back or remediate using the project’s deployment process if a regression
  is observed; do not improvise destructive data operations.

**Exit criteria:** The deployed behavior is confirmed and follow-up issues are
recorded.

## Possible product workstreams

These are areas represented by the current application, not prioritized
commitments:

1. Business records and sales/purchase transaction workflows.
2. Payment allocation and customer/vendor credit workflow consistency.
3. Dashboard and reporting improvements.
4. Authentication, authorization, security, and session reliability.
5. Administrative operations, backup, and database/API observability.
6. Responsive design, accessibility, and cross-device workflow refinement.

Each workstream should be split into independently reviewable changes with
explicit user outcomes and measurable acceptance criteria before work begins.
