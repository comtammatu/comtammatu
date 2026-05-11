-- name: GetUserByEmail :one
SELECT id, tenant_id, branch_id, email, password_hash, full_name, phone, user_role, position, is_active, created_at, updated_at
FROM public.users
WHERE email = @email AND is_active = true
LIMIT 1;

-- name: GetUserByID :one
SELECT id, tenant_id, branch_id, email, full_name, phone, user_role, position, is_active, created_at, updated_at
FROM public.users
WHERE id = @id AND tenant_id = @tenant_id;

-- name: ListUsers :many
SELECT id, tenant_id, branch_id, email, full_name, phone, user_role, position, is_active, created_at, updated_at
FROM public.users
WHERE tenant_id = @tenant_id
ORDER BY full_name;

-- name: CreateUser :one
INSERT INTO public.users (tenant_id, branch_id, email, password_hash, full_name, phone, user_role, position)
VALUES (@tenant_id, @branch_id, @email, @password_hash, @full_name, @phone, @user_role, @position)
RETURNING id, tenant_id, branch_id, email, full_name, phone, user_role, position, is_active, created_at, updated_at;

-- name: UpdateUser :one
UPDATE public.users
SET full_name = COALESCE(sqlc.narg('full_name'), full_name),
    user_role = COALESCE(sqlc.narg('user_role'), user_role),
    branch_id = COALESCE(sqlc.narg('branch_id'), branch_id),
    is_active = COALESCE(sqlc.narg('is_active'), is_active),
    updated_at = now()
WHERE id = @id AND tenant_id = @tenant_id
RETURNING id, tenant_id, branch_id, email, full_name, phone, user_role, position, is_active, created_at, updated_at;

-- name: DeactivateUser :exec
UPDATE public.users SET is_active = false, updated_at = now()
WHERE id = @id AND tenant_id = @tenant_id;
