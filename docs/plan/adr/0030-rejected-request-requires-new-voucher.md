# ADR 0030 — A rejected request is replaced by a new voucher, not revived

**Status:** Accepted (Owner 2026-08-10).

**Decision owner:** Owner

**Review tier:** T2 — procurement document lifecycle, operator flow

## Context

Rejected request lines dead-end. The requester sees the rejection but has no
path forward, so the underlying demand is simply lost: the branch still needs
the ingredient, and nothing in the system carries that need.

Two shapes were available. Reopening the rejected document for editing keeps one
row but destroys the audit meaning of the rejection — the approver rejected a
specific set of lines and quantities, and editing in place makes that decision
refer to something that no longer exists. Creating a replacement document keeps
the rejection intact as a decision about a specific voucher.

## Decision

### 1. Rejection is terminal for that voucher

A rejected `Yêu cầu hàng` (stock request) or `Yêu cầu mua` (purchase request)
stays rejected. It is not reopened, reactivated, or edited back into an approval
flow. The rejected document remains readable as the record of what was asked
and what the approver decided.

### 2. The operator creates a new voucher

To pursue the same need, the operator creates a **new** request. The new voucher
is an independent document with its own approval path.

### 3. Copying from the rejected voucher is a first-class action

The rejected voucher can be used as a template: the operator copies its lines
into a new draft and edits them before submitting. Retyping the request from
memory is the failure mode this avoids.

The copy is a starting draft, not a link — the new voucher does not inherit the
rejected one's approval state.

Rejected: editing a rejected voucher back into review; silently cloning without
operator confirmation; leaving the rejection as a dead end.

## Consequences

- Approval history stays truthful: each decision refers to exactly the document
  it was made against.
- Rejected demand becomes visible follow-up work instead of a silent loss.
- The rejected voucher gains a copy action on its detail surface; the new draft
  must make clear it is a new document, not a resubmission.
- Repeated reject-and-recreate cycles on the same ingredient are a signal worth
  surfacing later; this ADR does not add that reporting.

## Follow-up implementation pointers

Implementation is open work in `tasks/todo.md`.

- Add the copy-to-new-draft action on rejected stock and purchase requests.
- Keep operator labels `Yêu cầu hàng` and `Yêu cầu mua` in
  `docs/ref/glossary.md`; stored identifiers stay English per
  `docs/agent/rules/language.md`.

## Canonical

- `docs/ref/inventory.md` §11, D093, D099
