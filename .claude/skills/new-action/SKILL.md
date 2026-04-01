---
name: new-action
description: Create a new Server Action with Zod validation, auth context, and safe error handling. Use when adding server-side mutations.
whenToUse: When user asks to add a server action, create a mutation, or implement a form submission handler
argument-hint:
  [action name and purpose, e.g. "createBranch for branch management"]
allowed-tools: Read, Write, Edit, Glob, Grep
context: fork
---

Create Server Action: $ARGUMENTS

## Pre-flight

1. Read `.claude/rules/server-actions.md`
2. Read `tasks/regressions.md` — check: NO_RAW_DB_ERRORS, VERIFY_DB_SCHEMA_BEFORE_QUERY, BATCH_STOCK_NEEDS_RPC
3. If action queries a table, verify column names from `packages/database/src/types/database.types.ts`

## Template

```ts
"use server";

import { z } from "zod";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";

const schema = z.object({
  // Define input schema with Zod 4 syntax
  // Use { error: "message" } not { message: "message" }
});

interface ActionResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export async function actionName(formData: FormData): Promise<ActionResult> {
  // 1. Parse + validate input
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, error: "Dữ liệu không hợp lệ" };
  }

  // 2. Auth context
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Chưa đăng nhập" };

  const claims = extractClaims(user.app_metadata);
  if (!claims) return { success: false, error: "Không có quyền" };

  // 3. DB operation (verify tenant_id ownership)
  const { data, error } = await supabase
    .from("table")
    .insert({ ...parsed.data, tenant_id: claims.tenant_id });

  // 4. Safe error response — NEVER expose raw DB error
  if (error) {
    console.error("actionName failed:", error);
    return { success: false, error: "Không thể thực hiện. Vui lòng thử lại." };
  }

  return { success: true, data };
}
```

## Rules

- Multi-item writes → use Postgres RPC (not loop)
- Stock "adjust" = set to exact qty, not add
- After `updateUser()` → must `refreshSession()`
- Return shape: `{ success, data?, error? }`
