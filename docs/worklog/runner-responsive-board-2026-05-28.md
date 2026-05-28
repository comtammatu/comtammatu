# Runner Responsive Board Typography - 2026-05-28

## T2 Self-Review

PM: Scope is the Runner customer board typography on desktop displays. Done means the same board remains readable on compact MacBook Air viewports and larger FullHD/2K/4K displays without changing Runner IA.

BA: Keep the four-row board, existing Runner copy, shared status vocabulary, wait-time behavior, and 12-column split. Status text must stay the same visual size as order, quantity, and wait-time cells.

Senior Dev: Update the design-system token contract first, then runtime theme tokens and source tests. Use shared Tailwind text tokens backed by `clamp(...dvh...)`; do not add page-level arbitrary text classes or viewport-width typography.

QA/QC: Verify the source test that guards Runner copy/tokens, then run repo gates. Render-check representative desktop viewports for clipping, overlap, blank page, and framework overlay risk.

## Follow-Up: Compact Desktop

Owner screenshot at 2026-05-28 18:34 showed a compact desktop viewport still clipping wrapped values like `Mang về #041` and `2 món`. Follow-up tightens the Runner token scale and uses compact `px-4 py-2` spacing below `xl`, while preserving the larger spacing for wide desktop displays.

## Follow-Up: Column Balance

PM: Increase scan room for `Số món` and `Trạng thái`; done means wait-time stays readable with a shorter `Chờ` header.

BA: `Chờ` is a label-only change for wait duration; wait values and ticking behavior remain unchanged.

Senior Dev: Use the existing `grid-cols-12` contract with spans `4/3/4/1`, and give the narrow wait column smaller horizontal padding.

QA/QC: Re-run Runner source tests and render compact/HD/FHD fixtures with `Mang về #041`, `2 món`, and multi-minute wait values.
