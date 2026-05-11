-- name: ListBranches :many
SELECT id, tenant_id, name, address, phone, is_active, is_headquarters, created_at, updated_at
FROM public.branches
WHERE tenant_id = @tenant_id
ORDER BY is_headquarters DESC, name;

-- name: GetBranch :one
SELECT id, tenant_id, name, address, phone, is_active, is_headquarters, created_at, updated_at
FROM public.branches
WHERE id = @id AND tenant_id = @tenant_id;

-- name: CreateBranch :one
INSERT INTO public.branches (tenant_id, name, address, phone)
VALUES (@tenant_id, @name, @address, @phone)
RETURNING id, tenant_id, name, address, phone, is_active, is_headquarters, created_at, updated_at;

-- name: UpdateBranch :one
UPDATE public.branches
SET name = COALESCE(sqlc.narg('name'), name),
    address = COALESCE(sqlc.narg('address'), address),
    phone = COALESCE(sqlc.narg('phone'), phone),
    is_active = COALESCE(sqlc.narg('is_active'), is_active),
    updated_at = now()
WHERE id = @id AND tenant_id = @tenant_id
RETURNING id, tenant_id, name, address, phone, is_active, is_headquarters, created_at, updated_at;

-- name: DeactivateBranch :exec
UPDATE public.branches SET is_active = false, updated_at = now()
WHERE id = @id AND tenant_id = @tenant_id;

-- name: ListAreas :many
SELECT id, branch_id, tenant_id, name, sort_order, created_at
FROM public.branch_zones
WHERE tenant_id = @tenant_id
ORDER BY branch_id, sort_order, name;

-- name: GetArea :one
SELECT id, branch_id, tenant_id, name, sort_order, created_at
FROM public.branch_zones
WHERE id = @id AND tenant_id = @tenant_id;

-- name: CreateArea :one
INSERT INTO public.branch_zones (tenant_id, branch_id, name)
VALUES (@tenant_id, @branch_id, @name)
RETURNING id, branch_id, tenant_id, name, sort_order, created_at;

-- name: UpdateArea :one
UPDATE public.branch_zones
SET name = COALESCE(sqlc.narg('name'), name),
    sort_order = COALESCE(sqlc.narg('sort_order'), sort_order)
WHERE id = @id AND tenant_id = @tenant_id
RETURNING id, branch_id, tenant_id, name, sort_order, created_at;
