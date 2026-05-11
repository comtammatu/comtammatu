-- name: ListMenuCategories :many
SELECT id, tenant_id, name, sort_order, is_active, created_at, updated_at
FROM public.menu_categories
WHERE tenant_id = @tenant_id AND is_active = true
ORDER BY sort_order, name;

-- name: GetMenuCategory :one
SELECT id, tenant_id, name, sort_order, is_active, created_at, updated_at
FROM public.menu_categories
WHERE id = @id AND tenant_id = @tenant_id;

-- name: CreateMenuCategory :one
INSERT INTO public.menu_categories (tenant_id, name, sort_order)
VALUES (@tenant_id, @name, @sort_order)
RETURNING id, tenant_id, name, sort_order, is_active, created_at, updated_at;

-- name: UpdateMenuCategory :one
UPDATE public.menu_categories
SET name = COALESCE(sqlc.narg('name'), name),
    sort_order = COALESCE(sqlc.narg('sort_order'), sort_order),
    is_active = COALESCE(sqlc.narg('is_active'), is_active),
    updated_at = now()
WHERE id = @id AND tenant_id = @tenant_id
RETURNING id, tenant_id, name, sort_order, is_active, created_at, updated_at;

-- name: ListMenuItems :many
SELECT id, tenant_id, category_id, name, description, base_price, image_url, is_active, sort_order, created_at, updated_at
FROM public.menu_items
WHERE tenant_id = @tenant_id AND is_active = true
ORDER BY sort_order, name;

-- name: GetMenuItem :one
SELECT id, tenant_id, category_id, name, description, base_price, image_url, is_active, sort_order, created_at, updated_at
FROM public.menu_items
WHERE id = @id AND tenant_id = @tenant_id;

-- name: CreateMenuItem :one
INSERT INTO public.menu_items (tenant_id, category_id, name, description, base_price)
VALUES (@tenant_id, @category_id, @name, @description, @base_price)
RETURNING id, tenant_id, category_id, name, description, base_price, image_url, is_active, sort_order, created_at, updated_at;

-- name: UpdateMenuItem :one
UPDATE public.menu_items
SET name = COALESCE(sqlc.narg('name'), name),
    description = COALESCE(sqlc.narg('description'), description),
    base_price = COALESCE(sqlc.narg('base_price'), base_price),
    is_active = COALESCE(sqlc.narg('is_active'), is_active),
    updated_at = now()
WHERE id = @id AND tenant_id = @tenant_id
RETURNING id, tenant_id, category_id, name, description, base_price, image_url, is_active, sort_order, created_at, updated_at;

-- name: DeleteMenuItem :exec
UPDATE public.menu_items SET is_active = false, updated_at = now()
WHERE id = @id AND tenant_id = @tenant_id;

-- name: ListMenuItemVariants :many
SELECT id, tenant_id, item_id, name, price_adjustment, is_active, sort_order
FROM public.menu_item_variants
WHERE item_id = @item_id AND tenant_id = @tenant_id AND is_active = true
ORDER BY sort_order, name;

-- name: CreateMenuItemVariant :one
INSERT INTO public.menu_item_variants (tenant_id, item_id, name, price_adjustment)
VALUES (@tenant_id, @item_id, @name, @price_adjustment)
RETURNING id, tenant_id, item_id, name, price_adjustment, is_active, sort_order;

-- name: ListMenuItemModifiers :many
SELECT id, tenant_id, item_id, name, price, is_active, sort_order
FROM public.menu_item_modifiers
WHERE item_id = @item_id AND tenant_id = @tenant_id AND is_active = true
ORDER BY sort_order, name;

-- name: CreateMenuItemModifier :one
INSERT INTO public.menu_item_modifiers (tenant_id, item_id, name, price)
VALUES (@tenant_id, @item_id, @name, @price)
RETURNING id, tenant_id, item_id, name, price, is_active, sort_order;
