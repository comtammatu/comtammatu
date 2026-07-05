# Turbo Monorepo — Standardization & Agent-Maintainability (2026-07-05)

> Reconciled-through `976af8cf6`. Nguồn: audit workflow 2026-07-05 (6 mapper + 3 lens
> design + 3 critic đối kháng) + verify code thật. Bổ trợ: `docs/CODEBASE_MAP.md`
> (đã có, 2026-07-05) + `docs/modules/infrastructure.md`. Plan này = SSoT trình tự;
> convention normative đích đến sống ở `docs/agent/rules/engineering.md` (không nhân bản).
>
> **Nguyên tắc chỉ đạo:** tách **Tranche 1 = thắng-config mechanical, 0 mơ hồ, ship ngay**
> khỏi **Tranche 2 = churn thư mục / tooling suy đoán, owner-gated**. Config wins agent
> cảm nhận ngay; đại phẫu 257 file phải có payoff chứng minh + owner chốt.

## 0. Phân loại repo — 4 bucket, mỗi path thuộc đúng 1

```
comtammatu/
├─ apps/        RUNTIME DELIVERABLES (build ra artifact, deploy)
│   ├─ web/         Next.js 16 — sản phẩm. Build → .next/. Ăn 5 package dạng SOURCE (.ts).
│   └─ print-agent/ esbuild daemon — bundle print-render SOURCE → dist/index.js (1 file).
├─ packages/    SHARED SOURCE LIBS (KHÔNG build, KHÔNG dist, ăn trực tiếp ./src/*.ts)
│   ├─ shared/      Domain logic — 16 domain subpath (auth, tax, hddt, kds, menu, payroll…). API = subpath.
│   ├─ ui/          React primitives, app-agnostic, tree-shakeable.
│   ├─ database/    Supabase client factories + `database.types.ts` generated.
│   ├─ security/    Rate-limit / edge guard. Barrel.
│   └─ print-render/ ESC-POS renderer SSoT (agent + web pixel-identical).
├─ tooling/     ENFORCEMENT & GEN (root scripts + scripts/*.mjs + turbo.json + eslint)
└─ docs/        KNOWLEDGE (AGENTS.md → docs/agent/rules/*.md SSoT → docs/modules/*.md → CODEBASE_MAP.md)
```

**Luật phụ thuộc canonical (flat DAG):** `web → {cả 5}`, `print-agent → print-render`.
KHÔNG package nào import package khác. Cross-package = bare specifier `@comtammatu/<pkg>`
qua `exports` — KHÔNG path alias, KHÔNG `../../packages/*`, KHÔNG deep `/src/*`.

**Bảng trách nhiệm (đích: thêm vào `CODEBASE_MAP.md` § "Package Build Status"):**

| Package | Build | Ăn dạng | Một dòng |
|---|---|---|---|
| shared | none | `./src/*` subpath | Domain logic; 16 domain độc lập; no barrel |
| ui | none | `./src/*` via exports | React primitives; tree-shakeable |
| database | none | `./src/*` via exports | Supabase client + generated types |
| security | none | `./src` barrel | Edge rate-limit/guard |
| print-render | none | `./src/*` via exports | ESC-POS renderer; print-agent bundle, web import |
| web | Next `.next/` | — | Sản phẩm |
| print-agent | esbuild `dist/` | — | Print daemon |

## 1. Bảng vấn đề (xếp hạng, đã sửa theo critic)

| # | Vấn đề | Sev | Blast | Fix | Guard | Tranche |
|---|---|---|---|---|---|---|
| P1 | `^build` phantom trên lint/typecheck/test (5 node `#build` no-op) serialize DAG | High | `turbo.json` | Bỏ `^build` khỏi lint/typecheck/test | dry-run CI | **1** |
| P2 | `shared#test` glob `apps/web/**` bust cache khi sửa 1 Button | High | 1 entry | Narrow glob **derive từ read thật** | `check-turbo-inputs` (opt) | **1** |
| P3 | `noEmit:true` chọi `outDir`/`declaration` ở 7 tsconfig — config chết | High | 7 tsconfig | Xoá `outDir`/`declaration`/`declarationMap` (sourceMap giữ tới khi verify) | — | **1** |
| P4 | Alias `@comtammatu/ui/*→packages/ui/src/*` bypass exports (2 tsconfig) | Med | 2 tsconfig, 0 deep-import | Xoá 2 alias | `no-restricted-imports` | **1** |
| P5 | shared barrel re-export 11 domain **0 ai import** | Med | `shared/src/index.ts` | Xoá export chết (grep-verified 0) | `no-restricted-imports` | **1** |
| P6 | `.tsbuildinfo` không nằm trong typecheck `outputs` → warm re-check full | Med | `turbo.json` | Thêm `outputs:["*.tsbuildinfo"]` | — | **1** |
| P7 | `apps/web/apps/web/output` rác Playwright (không track, không ignore) | Low | 0 file track | Xoá + gitignore + sửa `outputDir` | `check-web-taxonomy` | **1** |
| P8 | print-agent tsconfig đảo (no-extends, casing `Bundler`, ES2023) | Med | 1 file | Extend base, override target | — | **1** |
| P9 | 12-guard chuỗi `&&`: dừng ở lỗi đầu, giấu lỗi sau | Med | `package.json` | `run-guards.mjs` glob `check-*.mjs`, report-all | — | **2** |
| P10 | `_components`↔`components`, `_lib`↔`app/lib` — agent đặt file sai chỗ | High | 257 file, codemod | Merge 1 dir mỗi loại (§3) | `check-web-taxonomy` | **2 (owner)** |
| P11 | 50 `*-actions.ts` ở route-root; **collide re-export barrel** | High | ~150 relative-import depth-varying | Forward-only advisory (KHÔNG force-move) | `check-web-taxonomy` (AST) | **2 (owner)** |
| P12 | Placement rule = prose, không enforce → drift | High | 1 guard | data-map + `check-placement` | `check-placement` | **2** |
| P13 | Module index thiếu print-render/print-agent | Low | 2 doc | Thêm module doc + row | `check-map-staleness` (adv) | **2** |
| P14 | Remote cache chưa cấu hình (2.4GB local-only) | Low | policy | **Owner** (§5 D-cache) | — | **2 (owner)** |

> ✅ **Sửa theo verify:** `*.tsbuildinfo` **đã gitignore** (không commit) — bỏ mục "committed tsbuildinfo".
> `dist/` cũng gitignore. Số codemod thật = **433 dòng import qua 257 file** (không phải 441 "sites").

## 2. Tranche 1 — thắng-config mechanical (ship ngay, 0 mơ hồ)

Mỗi phase = 1 PR, gate xanh fresh, blast nhỏ, đảo được.

**T1.1 — dọn rác (trivial).** Xoá `apps/web/apps/`; gitignore nó; sửa Playwright `outputDir`.
Cập nhật `docs/modules/infrastructure.md` cho `print-render`/`print-agent` + row trong module-index. Gate: xanh.

**T1.2 — tsconfig dead-config (inert, nhưng verify per-file).**
```jsonc
// tsconfig.base.json — XOÁ: declaration, declarationMap  (GIỮ sourceMap tới khi verify §4)
//                       GIỮ: noEmit, incremental, strict, noUncheckedIndexedAccess, moduleResolution:"bundler"
// packages/*/tsconfig.json — XOÁ rootDir + outDir; giữ types:["node"], include:["src"]
// apps/print-agent/tsconfig.json — extends base + override target:"ES2023"/lib + noEmit:true (casing "bundler" fix free)
```
Xoá 7 `*.tsbuildinfo` cũ 1 lần (regen đúng). **Composite/project-references: KHÔNG**
(monorepo source-consumed, 1 bundler mỗi app; Turbo order + `skipLibCheck` đủ; revisit chỉ khi
web `tsc` đo được là nghẽn). **Gate T1.2 (bắt buộc, critic):** `pnpm typecheck && pnpm build`
(CẢ 2 app) + `pnpm --filter @comtammatu/print-agent build` phải xanh — KHÔNG chỉ typecheck+test.
Không xoá `sourceMap` khỏi base tới khi xác nhận Next server-side stack-trace không phụ thuộc.

**T1.3 — turbo graph (low).**
```jsonc
"lint":      { "inputs": ["$TURBO_DEFAULT$", "$TURBO_ROOT$/eslint.config.mjs"] },      // bỏ ^build
"typecheck": { "inputs": ["$TURBO_DEFAULT$", "$TURBO_ROOT$/tsconfig.base.json"], "outputs": ["*.tsbuildinfo"] },
"test":      { "outputs": [] },                                                        // bỏ ^build
"build":     { "dependsOn": ["^build"], "outputs": [".next/**","!.next/cache/**","dist/**","public/sw.js", ...] },
"@comtammatu/web#build": { "env": [...], "outputs": [".next/**", ...] },   // GIỮ outputs (Turbo REPLACE không merge — critic bất đồng → an toàn giữ)
```
**Gate T1.3 (critic, honor "distrust turbo cache"):** (a) grep test web+shared có import `.next/**`/route-manifest không (kỳ vọng: không) TRƯỚC khi bỏ `^build`; (b) chạy **COLD**: `rm -rf .turbo/cache apps/web/.next` rồi `pnpm turbo run typecheck lint test --dry=json` chứng minh parallelize từ t=0 + full `pnpm lint && pnpm test` (KHÔNG `| tail` — nuốt exit code); (c) `pnpm turbo run build --filter=@comtammatu/web --dry=json` diff `outputs` phải chứa `.next/**`+`dist/**`+sw/workbox.

**T1.4 — narrow `shared#test` glob (med, correctness — payoff hằng ngày cao nhất).**
KHÔNG đoán glob. **Derive từ read thật:**
`grep -rhoE 'apps/web/[^" ]+' packages/shared/src/**/*.test.ts | sort -u` → include mọi dir chạm.
Tối thiểu (đã verify test đọc): `apps/web/app/api/**` (không chỉ cron), `apps/web/proxy.ts`,
`apps/web/lib/**`, `apps/web/app/_lib/**`, `apps/web/public/sw.js`, `apps/web/vercel.json`,
`supabase/**`, `docs/{agent,modules,ref,runbooks}/**`, `tasks/**`, `scripts/**`.
Gate: `pnpm turbo run test --filter=@comtammatu/shared --force` rồi diff — land chỉ khi identical.
Optional `check-turbo-inputs.mjs` grep `readFileSync(repoPath(...))` trong test, diff bộ declared → chống drift.

**T1.5 — boundary enforce (0 vi phạm → strict NGAY, không advisory).**
Xoá 2 alias `@comtammatu/ui/*` (web + ui tsconfig). Xoá 11 export chết khỏi `shared/src/index.ts`
(grep 0 bare-import). Thêm `"sideEffects": false` + `"types":"./src/index.ts"` cho 6 lib package
(grep top-level side-effect trước). ESLint (rider flat-config sẵn, 0 dep mới):
```js
"no-restricted-imports": ["error", { patterns: [
  { group: ["@comtammatu/*/src/*","**/packages/*/src/*"], message: "Import qua package exports, không /src." },
  { group: ["../../../../*"], message: "Cross-package dùng @comtammatu/<pkg>, không deep-relative." } ]}]
```
Grep confirm 0 vi phạm → **strict ngay trong PR** (critic: không cần advisory khi pre-scan = 0).

**T1.6 — freeze-in-place guard (0 churn, chặn drift mới).**
`scripts/check-web-taxonomy.mjs` **chỉ chặn drift MỚI**, grandfather hiện trạng: cấm tạo dir
non-underscore `components|lib|hooks|utils` MỚI dưới `app/**`; cấm `apps/web/apps/` non-empty;
`*.tsbuildinfo`/rác. Đây là 80% payoff chống-drift với 0 codemod. **Trước khi bật:** grep-sweep
`scripts/ docs/ turbo.json .claude/` cho literal `app/components`/`app/lib`/`app/_utils` (vì
`check-ui-contract.mjs` hardcode `app/components/app-shell.tsx` + throw khi thiếu roots-dir) — không
đổi path nào ở T1 nên guard cũ an toàn; freeze-guard chỉ thêm.

## 3. Tranche 2 — churn / tooling (owner-gated)

**T2.1 — Full taxonomy migration (owner D-taxonomy).** Chỉ nếu owner chọn "codemod luôn"
thay "freeze + hội tụ lười". Canonical 3-tier, underscore = "không phải route" (Next private-dir):
```
apps/web/lib/                      TIER 3  cross-app, framework glue, KHÔNG React   @lib/*  (GIỮ, 231 site)
apps/web/app/_components|_lib|_hooks  TIER 2  app-wide  (merge _components+components, _lib+app/lib, fold _utils)
apps/web/app/(protected)/<feature>/_components|_lib|_hooks   TIER 1  route-local
```
Cây quyết định đặt file (→ `engineering.md § Conventions`, thay prose mờ ở CODEBASE_MAP):
2+ family & no-React → `lib/` · 2+ family & React → `app/_*` · 1 family → `<feature>/_*` ·
server action → `<feature>/_lib/` `"use server"` `<domain>-actions.ts` no-barrel.
**Staging = AST-codemod (ts-morph/jscodeshift), KHÔNG sed** (relative-import depth khác nhau
mỗi importer): T0 fold `_utils`+`app/lib`(2 file); T1 `components`→`_components` (433 dòng/257 file,
1 commit codemod); T2 rogue `finance/components`+`employee/components`. **Mỗi rename PHẢI cùng
commit update guard hardcode path** (`check-ui-contract.mjs` L272/283 + grep-sweep) nếu không `pnpm lint` đỏ.

**T2.2 — Action files (owner D-actions).** **Descope force-move** (critic blocker: ~150 relative
depth-varying + `procurement-actions.ts`/`production-actions.ts` là **re-export barrel hợp lệ KHÔNG
"use server"** — thêm directive VỠ build theo `use-server-no-reexport`). Mặc định: **forward-only** —
action mới vào `_lib/`, grandfather cũ; `check-web-taxonomy` key off **AST** (`"use server"` HOẶC mọi
export async), KHÔNG theo tên `-actions.ts` (nếu không guard flag nhầm client-hook
`grn/[id]/_hooks/use-grn-line-actions.ts` + barrel). Nếu muốn relocate: **1 spike AST trên inventory**,
giữ barrel ở feature-root, chỉ move leaf `"use server"`, verify xanh trước khi tổng quát.

**T2.3 — Guard tooling (owner D-tooling).** Mặc định **tối thiểu**: `scripts/run-guards.mjs` glob
`scripts/check-*.mjs`, chạy hết, in `✓N ⚠M ✗K` (thay chuỗi `&&` giấu-lỗi). 80% ergonomics, 20% surface.
KHÔNG dựng `registry.mjs`+`check-registry-sync`+`gen-scripts-doc` trừ khi owner muốn catalog (thêm
meta-tooling + drift-guard riêng — đúng thứ repo đã nhiều).

**T2.4 — Placement guard + conventions SSoT.** `scripts/placement-matrix.mjs` (rule regex: no
cross-family `_lib` import, no package→app import, no relative package import) + `check-placement.mjs`
**advisory trước** (có backlog thật), flip strict sau 1 sweep sạch. Normative rule sống **1 nơi**
`engineering.md § Conventions`; CODEBASE_MAP giữ narrative + **link** (bỏ prose trùng). Sửa mirror
block phải **byte-identical 2 phía** (`AGENTS.md`↔`engineering.md`, `pnpm lint:rules-mirror`) — ưu
tiên KHÔNG đụng code-block `MIRROR:commands`, chỉ repoint prose ngoài mirror.

**T2.5 — Remote cache (owner D-cache).** Bật Turbo Remote Cache (Vercel/Turbo token + CI secret) →
tái dùng cross-runner trên các task giờ đã parallel. Policy/cost call.

## 4. Kỷ luật verify (critic — không bỏ)
- **Cold-cache** trước mọi claim tốc-độ/thứ-tự (`rm -rf .turbo/cache apps/web/.next`) — distrust turbo cache.
- `--dry=json` diff `outputs` sau mọi sửa turbo build task.
- **Grep-sweep** `scripts/ docs/ turbo.json .claude/` cho literal path TRƯỚC mọi rename dir; update guard cùng commit.
- Mirror block byte-identical + `lint:rules-mirror` gate.
- Full `pnpm lint && pnpm test` fresh worktree sạch (không `| tail`) trước merge; T1.2 thêm CẢ 2 app build.
- No-tombstone: xoá sạch, không note provenance; regen `lint:i18n:baseline` nếu đụng comment.

## 5. Cổng quyết định owner — ✅ CHỐT 2026-07-05 (D069)

> Owner chọn **full scope** cả 4 fork. Rào an toàn critic GIỮ NGUYÊN (owner chọn phạm vi,
> không đổi phương pháp): AST codemod không sed · grep-sweep guard cùng commit · giữ barrel ·
> loại client-hook · cold-cache verify.

| ID | Fork | Chốt |
|---|---|---|
| **D-taxonomy** | Migration `_components`/`_lib` | ✅ **Full codemod ngay** (T2.1, AST, 433 dòng/257 file, guard-update cùng commit) — KHÔNG freeze |
| **D-actions** | 50 `*-actions.ts` → `_lib/` | ✅ **AST-spike `inventory` trước rồi tổng quát**; giữ barrel feature-root, chỉ move leaf "use server", loại client-hook; guard key off AST |
| **D-tooling** | Guard runner | ✅ **Full registry** (`registry.mjs`+`check-registry-sync`+`run-guards`+`gen-scripts-doc`→`scripts.md`) |
| **D-cache** | Turbo Remote Cache | ✅ **Bật** (Vercel/Turbo token + CI secret — owner-lane) |
| **D-refs** | TS project references / split shared | ❌ **KHÔNG** (source-only, 1 bundler; split shared defer tới khi 1 domain cần dep/release riêng) |

## Load-bearing files
`turbo.json` · `tsconfig.base.json` + `packages/*/tsconfig.json` + `apps/{web,print-agent}/tsconfig.json` ·
`packages/*/package.json` (exports/types/sideEffects) · `packages/shared/src/index.ts` (barrel chết) ·
`eslint.config.mjs` + `apps/web/eslint.config.mjs` (no-restricted-imports) · `package.json` (lint chain) ·
`scripts/check-web-taxonomy.mjs` + `scripts/run-guards.mjs` (mới) · `scripts/check-ui-contract.mjs` (grep-sweep khi rename) ·
`AGENTS.md`+`docs/agent/rules/engineering.md` (mirror + § Conventions) · `docs/CODEBASE_MAP.md` + `docs/modules/infrastructure.md`.
