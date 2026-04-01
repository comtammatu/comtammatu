---
name: new-page
description: Scaffold a new admin page with auth guard and proper patterns. Use when adding a new page to /admin/ or /br/[branchId]/.
whenToUse: When user asks to create a new page, add a route, or scaffold a UI section
argument-hint: [route path, e.g. "admin/inventory" or "br/[branchId]/pos"]
allowed-tools: Read, Write, Edit, Glob, Grep
context: fork
---

Scaffold a new page at: $ARGUMENTS

## Pre-flight

1. Read `docs/spec/architecture.md` — URL structure, import boundaries
2. Read `packages/shared/src/auth/module-acl.ts` — check if module ACL entry exists
3. Check proxy.ts `resolveModule()` has mapping for this route

## Steps

### 1. Module ACL

If no ACL entry exists in `module-acl.ts`:

- Add `ModuleKey` to the union type
- Add entry to `MODULE_ACL` with path + allowedRoles

### 2. Proxy Route Mapping

If `resolveModule()` in `apps/web/proxy.ts` doesn't map this path:

- Add pathname check returning the new ModuleKey

### 3. Page File

Create `apps/web/app/(admin)/<route>/page.tsx`:

```tsx
export default function XxxPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Title</h1>
      <p className="mt-2 text-muted-foreground">Description</p>
    </div>
  );
}
```

### 4. Update Sidebar

Add navigation link in `apps/web/app/(admin)/layout.tsx`

## Rules

- RSC by default — add "use client" only when interactivity needed
- Auth guard already in `(admin)/layout.tsx` — no need to re-check in page
- Scope from URL params, NEVER localStorage
- Import from `@comtammatu/database` barrel (server-side OK)
