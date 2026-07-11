# ADR 0010 — Motion contract gap-fill

**Status:** Accepted

**Decision owner:** `docs/spec/design-system.md` § Motion Contract

## Context

A broader motion plan proposed 300ms content/card/list enters, KDS animation on
render-key changes, grid fades, view crossfades and decorative press effects.
That shape conflicted with the operational UI contract and could create false
signals on realtime POS/KDS surfaces.

## Decision

- Content enter is optional, one-shot and `motion-safe`, using the short 150ms
  state-feedback tier only.
- Never use the 300ms overlay duration for card/list/content enter.
- KDS may signal only a genuine new-ticket event from proven event identity;
  snapshot refresh, reconnect, filter/station/mode change, removal and reorder
  must not replay the signal.
- Operational route loading uses shared `PageSkeleton` / `PageSpinner` patterns;
  no decorative page transition layer.
- Prefer hard cuts on POS/KDS when motion does not clarify a functional state.

## Consequences

Allowed implementation slices are narrow: cart-line confirmation, genuine KDS
new-ticket attention and missing operator loading frames. They must not add an
animation library, `transition-all`, decorative loops, layout-property motion,
or route-local keyframes.

Self-order decorative motion, grid fades, view crossfades, list press polish and
app-wide page transitions remain out of scope until browser evidence proves an
operational problem and the design-system contract is deliberately changed.

## Verification

Any implementation must prove reduced-motion behavior, no KDS false positives,
no attention overload, and the normal typecheck/lint/build/browser gates for the
changed surface.
