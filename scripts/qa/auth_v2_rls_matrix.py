#!/usr/bin/env python
"""
Auth v2 QA — RLS matrix test.

For each seed user, sign in via Supabase Auth, then hit representative tables
with the user's access_token. Record row count and HTTP status. Compare against
expected pattern (see RULES). Print pass/fail summary.

Usage: python scripts/qa/auth_v2_rls_matrix.py
Requires .env.local sourced: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY

Password: Test1234! (seed default)
"""
import json
import os
import sys
import urllib.request
import urllib.error
from typing import Any

URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
ANON = os.environ["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
PASSWORD = "Test1234!"

# User email → (role, branch_id, area_id)
USERS = [
    ("owner@comtammatu.vn",              "owner",              None, None),
    ("supermanager@comtammatu.vn",       "super_manager",      1,    None),
    ("area.vungtau@comtammatu.vn",       "area_manager",       None, 1),
    ("manager.datdo@comtammatu.vn",      "branch_manager",     2,    None),
    ("manager.phuochai@comtammatu.vn",   "branch_manager",     3,    None),
    ("cashier.datdo@comtammatu.vn",      "cashier",            2,    None),
    ("cashier.phuochai@comtammatu.vn",   "cashier",            3,    None),
    ("waiter.datdo@comtammatu.vn",       "waiter",             2,    None),
    ("waiter.phuochai@comtammatu.vn",    "waiter",             3,    None),
    ("chef.datdo@comtammatu.vn",         "chef",               2,    None),
    ("chef.phuochai@comtammatu.vn",      "chef",               3,    None),
    ("office@comtammatu.vn",             "office",             None, None),
    ("warehouse@comtammatu.vn",          "warehouse_manager",  1,    None),
    ("production@comtammatu.vn",         "production_manager", 4,    None),
]

# Expectations: (table, query_suffix, expected_min_rows_for_role_kind)
# "min_rows" = at minimum this many rows visible (0 = should be blocked OR empty)
# kind groups: OWNER, ADMIN (super+area+branch_mgr), OPS (cashier+waiter+chef),
# WAREHOUSE (warehouse_manager), PRODUCTION, OFFICE

def http_post(path: str, payload: dict, headers: dict) -> tuple[int, Any]:
    req = urllib.request.Request(
        f"{URL}{path}",
        data=json.dumps(payload).encode(),
        headers={**headers, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())

def http_get(path: str, token: str) -> tuple[int, int]:
    """Returns (status, row_count). Uses Prefer: count=exact."""
    req = urllib.request.Request(
        f"{URL}{path}",
        headers={
            "apikey": ANON,
            "Authorization": f"Bearer {token}",
            "Prefer": "count=exact",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            body = r.read()
            rng = r.headers.get("Content-Range", "0-0/0")
            count = int(rng.split("/")[-1]) if "/" in rng else 0
            return r.status, count
    except urllib.error.HTTPError as e:
        return e.code, 0


def sign_in(email: str) -> str | None:
    status, data = http_post(
        "/auth/v1/token?grant_type=password",
        {"email": email, "password": PASSWORD},
        {"apikey": ANON},
    )
    if status != 200:
        return None
    return data.get("access_token")


# Test probes — (table, query, description)
PROBES = [
    ("ingredients",           "/rest/v1/ingredients?select=id&limit=1",                                  "catalog"),
    ("menu_items",            "/rest/v1/menu_items?select=id&limit=1",                                   "catalog"),
    ("orders (CN2)",          "/rest/v1/orders?select=id&branch_id=eq.2&limit=1",                        "branch 2"),
    ("orders (CN3)",          "/rest/v1/orders?select=id&branch_id=eq.3&limit=1",                        "branch 3"),
    ("kds_tickets (CN2)",     "/rest/v1/kds_tickets?select=id&branch_id=eq.2&limit=1",                   "branch 2"),
    ("payroll_entries",       "/rest/v1/payroll_entries?select=id&limit=1",                              "sensitive"),
    ("audit_logs",            "/rest/v1/audit_logs?select=id&limit=1",                                   "admin"),
    ("suppliers",             "/rest/v1/suppliers?select=id&limit=1",                                    "procurement"),
    ("pos_sessions (CN2)",    "/rest/v1/pos_sessions?select=id&branch_id=eq.2&limit=1",                  "branch 2"),
    ("staff_permissions (self)", "/rest/v1/staff_permissions?select=id&limit=100",                       "self"),
    ("branches",              "/rest/v1/branches?select=id&limit=100",                                   "selector"),
]


def test_user(email: str, role: str, branch: int | None, area: int | None):
    token = sign_in(email)
    if not token:
        print(f"  ✗ SIGN-IN FAILED for {email}")
        return []

    results = []
    for table, query, desc in PROBES:
        status, count = http_get(query, token)
        results.append((table, desc, status, count))
    return results


def evaluate(role: str, branch: int | None, probe: str, status: int, count: int) -> tuple[bool, str]:
    """Return (is_expected, explanation). Heuristic expectations."""
    table, scope = probe.split(" ", 1) if " " in probe else (probe, "")

    # Catch-all: auth error should never happen for signed-in user
    if status == 401:
        return False, "401 unauthorized (JWT issue)"

    # PostgREST returns 200 or 206 (Partial Content) for successful reads
    ok_status = status in (200, 206)

    # Self-scope grants visible to any user
    if probe == "staff_permissions (self)":
        return (count > 0, f"has {count} own grants" if count > 0 else "no grants visible")

    # Tenant catalog: branches always visible
    if probe == "branches":
        return (count >= 1, f"{count} branches")

    # Owner sees everything
    if role == "owner":
        return (count >= 0 and ok_status, f"owner: {count} rows")

    # super_manager sees everything tenant-wide
    if role == "super_manager":
        return (count >= 0 and ok_status, f"super_manager: {count} rows")

    # Per-role heuristics
    if probe == "ingredients":
        # Only inventory:read holders. waiter/cashier/chef don't have it.
        if role in ("cashier", "waiter", "chef", "office"):
            return (count == 0, f"{count} rows (expect 0, no inventory:read)")
        return (count >= 0, f"{count} rows")

    if probe == "menu_items":
        # Open catalog — all tenant users see. But RLS now requires SELECT policy.
        # Actually we kept tenant_select open for menu_items; any authenticated sees.
        return (ok_status, f"{count} rows")

    if probe == "orders (CN2)":
        # Branch 2 users + area_manager 1 (VT → CN2+CN3) + managers
        if branch == 2:
            return (ok_status, f"{count} CN2 orders")
        if role == "area_manager" and area == 1:
            return (ok_status, f"area_mgr: {count} CN2 orders")
        if role in ("warehouse_manager", "production_manager", "office"):
            return (count == 0, f"{count} (expect 0 — no orders:read on CN2)")
        if branch == 3:
            return (count == 0, f"{count} (wrong branch)")
        return (count >= 0, f"{count}")

    if probe == "orders (CN3)":
        if branch == 3:
            return (ok_status, f"{count} CN3 orders")
        if role == "area_manager" and area == 1:
            return (ok_status, f"area_mgr: {count} CN3 orders")
        if role in ("warehouse_manager", "production_manager", "office"):
            return (count == 0, "0 (no orders:read)")
        if branch == 2:
            return (count == 0, "0 (wrong branch)")
        return (count >= 0, f"{count}")

    if probe == "kds_tickets (CN2)":
        # kds:use (chef CN2) OR orders:read (cashier/waiter CN2 + managers)
        if branch == 2:
            return (ok_status, f"{count} tickets")
        if role == "area_manager" and area == 1:
            return (ok_status, f"area_mgr: {count}")
        if role in ("warehouse_manager", "production_manager", "office"):
            return (count == 0, "0 (no kds/orders read)")
        if branch == 3:
            return (count == 0, "0 (wrong branch)")
        return (count >= 0, f"{count}")

    if probe == "payroll_entries":
        # finance:payroll_calculate or finance:view; self sees own
        if role in ("office",):  # office template has hr but not finance
            return (count == 0, "0 (office has no finance:view)")
        if role in ("cashier", "waiter", "chef"):
            # Can see own payslip if employees.profile_id matches (0 in dev if no data)
            return (ok_status, f"{count} (self-view or empty)")
        return (ok_status, f"{count}")

    if probe == "audit_logs":
        # Only settings:tenant (super_manager, owner)
        if role in ("owner", "super_manager"):
            return (ok_status, f"{count} audit rows")
        return (count == 0, f"{count} (no settings:tenant)")

    if probe == "suppliers":
        # procurement:read — warehouse_manager, production_manager, ke_toan, managers, office(no)
        if role in ("cashier", "waiter", "chef", "office"):
            return (count == 0, f"{count} (no procurement:read)")
        return (ok_status, f"{count}")

    if probe == "pos_sessions (CN2)":
        # pos:use on branch 2
        if branch == 2:
            return (ok_status, f"{count}")
        if role == "area_manager" and area == 1:
            return (ok_status, f"{count}")
        if role in ("warehouse_manager", "production_manager", "office"):
            return (count == 0, f"{count}")
        if branch == 3:
            return (count == 0, "0 (wrong branch)")
        return (count >= 0, f"{count}")

    return (ok_status, f"{count}")


def main():
    print(f"Auth v2 RLS matrix — {len(USERS)} users × {len(PROBES)} probes\n")
    overall_pass = 0
    overall_fail = 0
    fails = []

    for email, role, branch, area in USERS:
        scope = f"br{branch}" if branch else (f"area{area}" if area else "tenant")
        print(f"\n=== {role:<18} {scope:<8} {email}")
        results = test_user(email, role, branch, area)
        for table, desc, status, count in results:
            probe = f"{table} {desc}" if desc and desc != table else table
            ok, explain = evaluate(role, branch, probe, status, count)
            mark = "✓" if ok else "✗"
            print(f"  {mark} {table:<28} [{status}] {explain}")
            if ok:
                overall_pass += 1
            else:
                overall_fail += 1
                fails.append((email, role, probe, status, count, explain))

    print(f"\n─────────────────────")
    print(f"PASS: {overall_pass} / {overall_pass + overall_fail}")
    print(f"FAIL: {overall_fail}")
    if fails:
        print("\nFailures:")
        for email, role, probe, status, count, explain in fails:
            print(f"  • {role:<18} {probe:<30} [{status}] {explain}  ({email})")
    return 0 if overall_fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
