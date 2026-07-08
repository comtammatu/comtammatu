# Worklog Policy

This directory is not an archive, backlog, or source of truth.

Use PR bodies, task notes, or commit messages for transient implementation
artifacts. If a fact must survive beyond the PR, promote it into the owning
source-of-truth doc:

- `docs/ref/`
- `docs/spec/`
- `docs/modules/`
- `docs/plan/adr/`
- `docs/runbooks/`
- `tasks/regressions.md`
- `tasks/lessons.md`

Do not add dated worklog files for completed work. Delete staging notes after
promotion; git history is the archive.
