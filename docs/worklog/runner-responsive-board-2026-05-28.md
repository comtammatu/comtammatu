# Runner Responsive Board Typography - 2026-05-28

## T2 Self-Review

PM: Scope is the Runner customer board typography on desktop displays. Done means the same board remains readable on compact MacBook Air viewports and larger FullHD/2K/4K displays without changing Runner IA.

BA: Keep the four-row board, existing Runner copy, shared status vocabulary, wait-time behavior, and 12-column split. Status text must stay the same visual size as order, quantity, and wait-time cells.

Senior Dev: Update the design-system token contract first, then runtime theme tokens and source tests. Use shared Tailwind text tokens backed by `clamp(...dvh...)`; do not add page-level arbitrary text classes or viewport-width typography.

QA/QC: Verify the source test that guards Runner copy/tokens, then run repo gates. Render-check representative desktop viewports for clipping, overlap, blank page, and framework overlay risk.
