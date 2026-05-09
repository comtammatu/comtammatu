---
name: Bug report
about: Report broken behavior or a regression
title: "[bug] "
labels: bug
assignees: comtammatu
---

## Repro steps
<!-- Numbered list. Include exact URL, role (owner / quan_ly_CN / cashier / customer), and scope (?branchId= if relevant). -->

1.
2.
3.

## Expected
<!-- One paragraph. -->

## Actual
<!-- One paragraph. Paste error message verbatim if any. -->

## Environment
- **Commit / version:** <!-- `git rev-parse HEAD` or VERSION file content -->
- **Browser / device:** <!-- e.g. Chrome 142 on iPad Air, Safari iOS 18 -->
- **Branch / tenant scope:** <!-- e.g. ?branchId=2 or admin (HQ) -->
- **Time observed (UTC+7):** <!-- 2026-05-09 14:23 -->

## Severity
- [ ] **Critical** — blocks production sales / payments / KDS / stock writes.
- [ ] **High** — broken for one role or one branch; workaround exists.
- [ ] **Medium** — intermittent or visual regression; non-blocking.
- [ ] **Low** — cosmetic or low-traffic path.

## Triage notes (filled by maintainer)

- [ ] Reproduced locally.
- [ ] Mapped to `tasks/regressions.md` rule (if any).
- [ ] Targeted release: `1.2.0.x`.
