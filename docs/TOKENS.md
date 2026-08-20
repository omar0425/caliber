# Caliber design tokens

One page. Everything below lives in `app/globals.css` (`@theme` + `@layer components`).
Rule of thumb: **reach for a token or a component class before a raw value.** If a
utility needs `!important` (`!` suffix), the token layer is missing something — add
the variant, don't escape.

## Colour (LOCKED — gold on near-black)

| Token | Value | Use |
|---|---|---|
| `base` / `surface` / `surface-2` | `#0b0b0e` / `#141419` / `#1c1c23` | page bg, cards, raised fills |
| `line` | `#2a2a33` | borders, hairlines |
| `ink` / `muted` | `#f2f1f5` / `#b6b6c0` | primary / secondary text |
| `accent` / `accent-soft` | `#c8a45c` / `#e6cf9a` | the gold; interactive + display |
| `danger` / `warn` / `good` | `#e5675f` / `#e0b24a` / `#6fbf8b` | status — **always paired with a shape or label, never colour alone** |

## Type (floor: 13px — nothing smaller ships)

| Utility | Size | Use |
|---|---|---|
| `text-xs` | 13px | badges, aux labels (floor) |
| `text-sm` | 15px | secondary text |
| — | 18px | body reading size — inherited from `body` (use `text-lg` to request it explicitly) |
| `text-xl` → `text-5xl` | 20 / 24 / 30 / 36 / 48px | headings; `font-serif` (Playfair) for display |

> **Trap (inherited from master): `text-base` is a COLOUR utility here**, not a
> font size — the app's `--color-base` token claims the name in Tailwind v4 and
> emits `color: var(--color-base)` (page background; white under the print
> remap). Never use `text-base` for sizing, and never rely on it for colour
> either: always pair text with an explicit `text-ink` / `text-muted` /
> `text-accent*` colour class.

- `.label` — 14.4px uppercase micro-label (`--tracking-label` 0.06em).
- `--leading-body` 1.6. Fonts: `--font-serif`, `--font-sans`, `--font-mono`.

## Space

Tailwind's default spacing scale (4px base). Repeating app patterns: card padding
`p-4 sm:p-6`, section gaps `space-y-6`/`space-y-8`, page gutter `px-4 sm:px-5`.

## Elevation

| Token | Use |
|---|---|
| `shadow-card` | raised cards on the base field |
| `shadow-overlay` | modals/overlays (incl. the intro) |
| `shadow-focus` | gold focus glow (`.input:focus`) |

## Radius

`--radius-card` 16px (`.card`, `.paper`) · `--radius-control` 10px (`.btn`, `.input`) ·
utilities `rounded-card` / `rounded-control` available.

## Motion

| Token | Value | Use |
|---|---|---|
| `--duration-fast` | 150ms | hover/focus feedback |
| `--duration-base` | 250ms | entrances, state swaps |
| `--duration-slow` | 400ms | branded moments (app-open tick) |
| `--ease-standard` | `cubic-bezier(0.2,0,0,1)` | default (`ease-standard` utility) |
| `--ease-emphasized` | `cubic-bezier(0.3,1.4,0.5,1)` | subtle overshoot, branded beats |

**`prefers-reduced-motion: reduce` disables all animation and transition globally**
(stylesheet clamp) — components must not re-introduce motion for reduced users.

## Component classes (live in `@layer components` — utilities override them cleanly)

`.card` `.card-hover` · `.btn` + `.btn-gold` `.btn-ghost` `.btn-danger` `.btn-sm` ·
`.input` + `.input-sm` · `.label` · `.rule` · `.paper` · `.shimmer`

Accessibility floor (LOCKED): 18px reading base, 48px min tap target (`.btn`, `.input`),
global `:focus-visible` gold outline, 13px minimum font size.
