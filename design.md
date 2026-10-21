# Design System and UX Notes

## 1. Design intent

GoldFlow is an operations-focused business application. Prioritize legibility,
fast structured data entry, clear financial summaries, and predictable
navigation over decorative complexity. Preserve the established visual language
when changing an existing screen.

## 2. Theme and tokens

Shared colors are defined in `src/config/colors.css`; light mode is the default
and dark mode is activated by `data-theme="dark"` on the document root.

| Role | Light theme | Dark theme |
| --- | --- | --- |
| Primary action/accent | `#AA00FF` | Same primary accent |
| Main background | `#f3f4f6` | `#0f172a` |
| Card/sidebar | `#ffffff` | `#1e293b` |
| Main text | `#374151` | `#94a3b8` |
| Header text | `#111827` | `#f8fafc` |
| Muted text | `#6b7280` | `#64748b` |
| Border | `#e5e7eb` | `#334155` |
| Success / danger | Green / red semantic tokens | Retain semantic roles |

Use existing CSS variables (for example, `var(--bg-card)`,
`var(--text-header)`, `var(--border)`, `var(--primary)`, and
`var(--danger)`) rather than hardcoding theme-dependent colors in new UI.

Spacing and layout tokens are in `src/config/layout.css`: spacing steps range
from `--space-xs` through `--space-xl`; the expanded/collapsed sidebar widths
are 240px/72px and the shared header height is 64px. Feature-specific values
may remain local when extracting them would add unnecessary indirection.

## 3. Layout and responsiveness

- The application uses a shared layout with sidebar/header navigation.
- Responsive thresholds are centralized in `src/config/breakpoints.js`:
  mobile 620px, tablet 768px, desktop 1024px. Some existing features may use
  local media queries or component-specific sizing.
- Mobile page implementations live under `Mobile/src/` and are used by
  corresponding feature screens where available.
- Keep tables, forms, modal content, menus, and financial totals usable at
  narrow viewport widths; avoid introducing horizontal overflow without an
  existing pattern.

## 4. Interaction patterns

- Use clear primary actions and secondary/cancel actions, with disabled states
  during loading or when an established rule prevents interaction.
- Display field-level validation near its field and preserve existing
  validation text where it is shared/configured.
- Use established toast and API error helpers to report outcomes.
- Make dialogs and action menus dismissible using the adjacent screen's
  established interaction pattern.
- Selection controls should have meaningful accessible labels, visible
  selected/disabled state, and keyboard-operable native controls where
  appropriate.
- Financial values should retain the project’s currency formatting and avoid
  introducing a new display calculation separate from the domain helper.

## 5. Data-entry and financial UI

- Use aligned table columns and consistent padding to make ledger-like data
  scannable.
- Keep invoice row selection, editable allocation fields, payment totals, and
  available-credit indicators visually distinct.
- Do not infer that payment amount, selected allocation total, and credit
  balance are interchangeable. Existing calculations determine their display
  and validation.
- Preserve empty, loading, error, and populated states when modifying a list or
  form.

## 6. Motion, typography, and icons

- Typography tokens are defined in `src/config/typography.css` and
  `typography.js`; use the configured sans-serif stack and existing sizing
  conventions.
- Lucide React supplies the established icon set.
- Motion and transitions are used in the existing application; keep animation
  purposeful and avoid motion that obstructs repeated data-entry interactions.
- `src/index.css` includes global transitions for color, background, and border;
  avoid layering unnecessary per-element animations.

## 7. Accessibility baseline

- Provide labels for form controls and accessible names for icon-only controls.
- Keep disabled controls genuinely disabled, not merely styled as inactive.
- Preserve focus visibility, semantic headings, button semantics, and
  keyboard-operable menus/dialogs where supported by existing components.
- Check contrast in both themes, especially muted text, validation messages, and
  disabled states.
