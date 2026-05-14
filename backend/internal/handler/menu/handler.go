package menu

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/personal/comtammatu/backend/internal/auth"
	"github.com/personal/comtammatu/backend/internal/httputil"
	"github.com/personal/comtammatu/backend/internal/middleware"
)

// categoryTypes is the allowlist for menu_categories.type. Mirror of
// apps/web/app/menu/actions.ts CATEGORY_TYPES — keep in sync. DB also enforces
// via CHECK constraint; this guard is for a friendlier 400 response and
// duplicate_name vs invalid_type disambiguation on the client.
var categoryTypes = map[string]bool{
	"main_dish": true,
	"side_dish": true,
	"drink":     true,
	"dessert":   true,
}

// isUniqueViolation reports whether err is a Postgres unique_violation (SQLSTATE 23505).
// The menu handler surfaces this as HTTP 409 with body {"error":"duplicate_name"}
// so the web layer can map it to the Vietnamese "Tên đã tồn tại" string.
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

// Handler handles menu-related HTTP endpoints.
type Handler struct {
	pool    *pgxpool.Pool
	checker middleware.PermissionChecker
}

// New returns a new Handler. checker may be nil (skips ABAC — legacy mode).
func New(pool *pgxpool.Pool, checker middleware.PermissionChecker) *Handler {
	return &Handler{pool: pool, checker: checker}
}

// Routes returns a chi.Router wired with all menu endpoints.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()

	read := h.perm("menu:read")
	write := h.perm("menu:write")

	r.With(read).Get("/categories", h.listCategories)
	r.With(write).Post("/categories", h.createCategory)
	r.With(read).Get("/categories/{id}", h.getCategory)
	r.With(write).Put("/categories/{id}", h.updateCategory)
	// Atomic bidirectional flip — UPDATE ... SET is_active = NOT is_active RETURNING ...
	// Replaces the legacy `toggle_category_active(p_id)` Supabase RPC.
	r.With(write).Patch("/categories/{id}/toggle-active", h.toggleCategoryActive)

	r.With(read).Get("/items", h.listItems)
	r.With(write).Post("/items", h.createItem)
	r.With(read).Get("/items/{id}", h.getItem)
	r.With(write).Put("/items/{id}", h.updateItem)
	r.With(write).Delete("/items/{id}", h.deleteItem)
	r.With(write).Patch("/items/{id}/toggle-active", h.toggleItemActive)

	r.With(read).Get("/items/{id}/variants", h.listVariants)
	r.With(write).Post("/items/{id}/variants", h.createVariant)

	r.With(read).Get("/items/{id}/modifiers", h.listModifiers)
	r.With(write).Post("/items/{id}/modifiers", h.createModifier)

	r.With(write).Delete("/categories/{id}", h.deleteCategory)

	r.With(read).Get("/items/{id}/daily-limit", h.getDailyLimit)
	r.With(write).Put("/items/{id}/daily-limit", h.updateDailyLimit)

	return r
}

// perm returns a RequirePermission middleware when a checker is configured,
// otherwise a no-op (preserves backward compatibility in tests).
func (h *Handler) perm(key string) func(http.Handler) http.Handler {
	if h.checker == nil {
		return func(next http.Handler) http.Handler { return next }
	}
	return middleware.RequirePermission(h.checker, key)
}

func parseID(r *http.Request) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
}

func (h *Handler) listCategories(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	const q = `SELECT id, tenant_id, name, type, sort_order, is_active, created_at
		FROM public.menu_categories
		WHERE tenant_id = $1 AND is_active = true
		ORDER BY sort_order, name`
	rows, err := h.pool.Query(r.Context(), q, claims.TenantID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to fetch categories")
		return
	}
	defer rows.Close()
	result := make([]MenuCategory, 0)
	for rows.Next() {
		var c MenuCategory
		var catType sql.NullString
		var sortOrder sql.NullInt32
		var createdAt sql.NullTime
		if err := rows.Scan(&c.ID, &c.TenantID, &c.Name, &catType, &sortOrder, &c.IsActive, &createdAt); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read categories")
			return
		}
		if catType.Valid {
			c.Type = catType.String
		}
		if sortOrder.Valid {
			c.SortOrder = int(sortOrder.Int32)
		}
		if createdAt.Valid {
			c.CreatedAt = createdAt.Time.String()
		}
		result = append(result, c)
	}
	httputil.WriteJSON(w, http.StatusOK, result)
}

func (h *Handler) getCategory(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, err := parseID(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	const q = `SELECT id, tenant_id, name, type, sort_order, is_active, created_at
		FROM public.menu_categories
		WHERE id = $1 AND tenant_id = $2`
	row := h.pool.QueryRow(r.Context(), q, id, claims.TenantID)
	var c MenuCategory
	var catType sql.NullString
	var sortOrder sql.NullInt32
	var createdAt sql.NullTime
	if err := row.Scan(&c.ID, &c.TenantID, &c.Name, &catType, &sortOrder, &c.IsActive, &createdAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.WriteError(w, http.StatusNotFound, "category not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to fetch category")
		return
	}
	if catType.Valid {
		c.Type = catType.String
	}
	if sortOrder.Valid {
		c.SortOrder = int(sortOrder.Int32)
	}
	if createdAt.Valid {
		c.CreatedAt = createdAt.Time.String()
	}
	httputil.WriteJSON(w, http.StatusOK, c)
}

func (h *Handler) createCategory(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req CreateMenuCategoryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		httputil.WriteError(w, http.StatusBadRequest, "name is required")
		return
	}
	if !categoryTypes[req.Type] {
		httputil.WriteError(w, http.StatusBadRequest, "invalid_type")
		return
	}
	const q = `INSERT INTO public.menu_categories (tenant_id, name, type, sort_order)
		VALUES ($1, $2, $3, $4)
		RETURNING id, tenant_id, name, type, sort_order, is_active, created_at`
	row := h.pool.QueryRow(r.Context(), q, claims.TenantID, req.Name, req.Type, req.SortOrder)
	var c MenuCategory
	var catType sql.NullString
	var sortOrder sql.NullInt32
	var createdAt sql.NullTime
	if err := row.Scan(&c.ID, &c.TenantID, &c.Name, &catType, &sortOrder, &c.IsActive, &createdAt); err != nil {
		if isUniqueViolation(err) {
			httputil.WriteError(w, http.StatusConflict, "duplicate_name")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to create category")
		return
	}
	if catType.Valid {
		c.Type = catType.String
	}
	if sortOrder.Valid {
		c.SortOrder = int(sortOrder.Int32)
	}
	if createdAt.Valid {
		c.CreatedAt = createdAt.Time.String()
	}
	httputil.WriteJSON(w, http.StatusCreated, c)
}

func (h *Handler) updateCategory(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, err := parseID(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req UpdateMenuCategoryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Type != nil && !categoryTypes[*req.Type] {
		httputil.WriteError(w, http.StatusBadRequest, "invalid_type")
		return
	}
	const q = `UPDATE public.menu_categories
		SET name = COALESCE($1, name),
		    type = COALESCE($2, type),
		    sort_order = COALESCE($3, sort_order),
		    is_active = COALESCE($4, is_active),
		    updated_at = now()
		WHERE id = $5 AND tenant_id = $6
		RETURNING id, tenant_id, name, type, sort_order, is_active, created_at`
	row := h.pool.QueryRow(r.Context(), q, req.Name, req.Type, req.SortOrder, req.IsActive, id, claims.TenantID)
	var c MenuCategory
	var catType sql.NullString
	var sortOrder sql.NullInt32
	var createdAt sql.NullTime
	if err := row.Scan(&c.ID, &c.TenantID, &c.Name, &catType, &sortOrder, &c.IsActive, &createdAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.WriteError(w, http.StatusNotFound, "category not found")
			return
		}
		if isUniqueViolation(err) {
			httputil.WriteError(w, http.StatusConflict, "duplicate_name")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to update category")
		return
	}
	if catType.Valid {
		c.Type = catType.String
	}
	if sortOrder.Valid {
		c.SortOrder = int(sortOrder.Int32)
	}
	if createdAt.Valid {
		c.CreatedAt = createdAt.Time.String()
	}
	httputil.WriteJSON(w, http.StatusOK, c)
}

func (h *Handler) listItems(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	const q = `SELECT id, tenant_id, category_id, name, description, base_price, image_url, is_active, created_at
		FROM public.menu_items
		WHERE tenant_id = $1 AND is_active = true
		ORDER BY sort_order, name`
	rows, err := h.pool.Query(r.Context(), q, claims.TenantID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to fetch items")
		return
	}
	defer rows.Close()
	result := make([]MenuItem, 0)
	for rows.Next() {
		var item MenuItem
		var categoryID sql.NullInt64
		var description, imageURL sql.NullString
		var createdAt sql.NullTime
		if err := rows.Scan(&item.ID, &item.TenantID, &categoryID, &item.Name, &description, &item.BasePrice, &imageURL, &item.IsActive, &createdAt); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read items")
			return
		}
		if categoryID.Valid {
			item.CategoryID = categoryID.Int64
		}
		if description.Valid {
			item.Description = description.String
		}
		if imageURL.Valid {
			item.ImageURL = imageURL.String
		}
		if createdAt.Valid {
			item.CreatedAt = createdAt.Time.String()
		}
		result = append(result, item)
	}
	httputil.WriteJSON(w, http.StatusOK, result)
}

func (h *Handler) getItem(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, err := parseID(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	const q = `SELECT id, tenant_id, category_id, name, description, base_price, image_url, is_active, created_at
		FROM public.menu_items
		WHERE id = $1 AND tenant_id = $2`
	row := h.pool.QueryRow(r.Context(), q, id, claims.TenantID)
	var item MenuItem
	var categoryID sql.NullInt64
	var description, imageURL sql.NullString
	var createdAt sql.NullTime
	if err := row.Scan(&item.ID, &item.TenantID, &categoryID, &item.Name, &description, &item.BasePrice, &imageURL, &item.IsActive, &createdAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.WriteError(w, http.StatusNotFound, "item not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to fetch item")
		return
	}
	if categoryID.Valid {
		item.CategoryID = categoryID.Int64
	}
	if description.Valid {
		item.Description = description.String
	}
	if imageURL.Valid {
		item.ImageURL = imageURL.String
	}
	if createdAt.Valid {
		item.CreatedAt = createdAt.Time.String()
	}
	httputil.WriteJSON(w, http.StatusOK, item)
}

func (h *Handler) createItem(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req CreateMenuItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.CategoryID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "category_id is required")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		httputil.WriteError(w, http.StatusBadRequest, "name is required")
		return
	}
	if strings.TrimSpace(req.BasePrice) == "" {
		httputil.WriteError(w, http.StatusBadRequest, "base_price is required")
		return
	}
	const q = `INSERT INTO public.menu_items (tenant_id, category_id, name, description, base_price, image_url)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, tenant_id, category_id, name, description, base_price, image_url, is_active, created_at`
	var desc, img *string
	if req.Description != "" {
		desc = &req.Description
	}
	if req.ImageURL != "" {
		img = &req.ImageURL
	}
	row := h.pool.QueryRow(r.Context(), q, claims.TenantID, req.CategoryID, req.Name, desc, req.BasePrice, img)
	var item MenuItem
	var categoryID sql.NullInt64
	var description, imageURL sql.NullString
	var createdAt sql.NullTime
	if err := row.Scan(&item.ID, &item.TenantID, &categoryID, &item.Name, &description, &item.BasePrice, &imageURL, &item.IsActive, &createdAt); err != nil {
		if isUniqueViolation(err) {
			httputil.WriteError(w, http.StatusConflict, "duplicate_name")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to create item")
		return
	}
	if categoryID.Valid {
		item.CategoryID = categoryID.Int64
	}
	if description.Valid {
		item.Description = description.String
	}
	if imageURL.Valid {
		item.ImageURL = imageURL.String
	}
	if createdAt.Valid {
		item.CreatedAt = createdAt.Time.String()
	}
	httputil.WriteJSON(w, http.StatusCreated, item)
}

func (h *Handler) updateItem(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, err := parseID(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req UpdateMenuItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	const q = `UPDATE public.menu_items
		SET name = COALESCE($1, name),
		    category_id = COALESCE($2, category_id),
		    description = COALESCE($3, description),
		    base_price = COALESCE($4, base_price),
		    image_url = COALESCE($5, image_url),
		    is_active = COALESCE($6, is_active),
		    updated_at = now()
		WHERE id = $7 AND tenant_id = $8
		RETURNING id, tenant_id, category_id, name, description, base_price, image_url, is_active, created_at`
	row := h.pool.QueryRow(r.Context(), q, req.Name, req.CategoryID, req.Description, req.BasePrice, req.ImageURL, req.IsActive, id, claims.TenantID)
	var item MenuItem
	var categoryID sql.NullInt64
	var description, imageURL sql.NullString
	var createdAt sql.NullTime
	if err := row.Scan(&item.ID, &item.TenantID, &categoryID, &item.Name, &description, &item.BasePrice, &imageURL, &item.IsActive, &createdAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.WriteError(w, http.StatusNotFound, "item not found")
			return
		}
		if isUniqueViolation(err) {
			httputil.WriteError(w, http.StatusConflict, "duplicate_name")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to update item")
		return
	}
	if categoryID.Valid {
		item.CategoryID = categoryID.Int64
	}
	if description.Valid {
		item.Description = description.String
	}
	if imageURL.Valid {
		item.ImageURL = imageURL.String
	}
	if createdAt.Valid {
		item.CreatedAt = createdAt.Time.String()
	}
	httputil.WriteJSON(w, http.StatusOK, item)
}

func (h *Handler) deleteItem(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, err := parseID(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	const q = `UPDATE public.menu_items SET is_active = false, updated_at = now()
		WHERE id = $1 AND tenant_id = $2`
	if _, err := h.pool.Exec(r.Context(), q, id, claims.TenantID); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to delete item")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) listVariants(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	itemID, err := parseID(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	const q = `SELECT id, item_id, name, price_adjustment, is_active
		FROM public.menu_item_variants
		WHERE item_id = $1 AND tenant_id = $2 AND is_active = true
		ORDER BY sort_order, name`
	rows, err := h.pool.Query(r.Context(), q, itemID, claims.TenantID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to fetch variants")
		return
	}
	defer rows.Close()
	result := make([]MenuItemVariant, 0)
	for rows.Next() {
		var v MenuItemVariant
		if err := rows.Scan(&v.ID, &v.ItemID, &v.Name, &v.PriceDelta, &v.IsActive); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read variants")
			return
		}
		result = append(result, v)
	}
	httputil.WriteJSON(w, http.StatusOK, result)
}

func (h *Handler) createVariant(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	itemID, err := parseID(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req struct {
		Name            string `json:"name"`
		PriceAdjustment string `json:"price_adjustment"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		httputil.WriteError(w, http.StatusBadRequest, "name is required")
		return
	}
	if strings.TrimSpace(req.PriceAdjustment) == "" {
		req.PriceAdjustment = "0"
	}
	const q = `INSERT INTO public.menu_item_variants (tenant_id, item_id, name, price_adjustment)
		VALUES ($1, $2, $3, $4)
		RETURNING id, item_id, name, price_adjustment, is_active`
	row := h.pool.QueryRow(r.Context(), q, claims.TenantID, itemID, req.Name, req.PriceAdjustment)
	var v MenuItemVariant
	if err := row.Scan(&v.ID, &v.ItemID, &v.Name, &v.PriceDelta, &v.IsActive); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to create variant")
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, v)
}

func (h *Handler) listModifiers(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	itemID, err := parseID(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	const q = `SELECT id, item_id, name, price, is_active
		FROM public.menu_item_modifiers
		WHERE item_id = $1 AND tenant_id = $2 AND is_active = true
		ORDER BY sort_order, name`
	rows, err := h.pool.Query(r.Context(), q, itemID, claims.TenantID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to fetch modifiers")
		return
	}
	defer rows.Close()
	result := make([]MenuItemModifier, 0)
	for rows.Next() {
		var m MenuItemModifier
		if err := rows.Scan(&m.ID, &m.ItemID, &m.Name, &m.Price, &m.IsActive); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read modifiers")
			return
		}
		result = append(result, m)
	}
	httputil.WriteJSON(w, http.StatusOK, result)
}

func (h *Handler) createModifier(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	itemID, err := parseID(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req struct {
		Name  string `json:"name"`
		Price string `json:"price"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		httputil.WriteError(w, http.StatusBadRequest, "name is required")
		return
	}
	if strings.TrimSpace(req.Price) == "" {
		req.Price = "0"
	}
	const q = `INSERT INTO public.menu_item_modifiers (tenant_id, item_id, name, price)
		VALUES ($1, $2, $3, $4)
		RETURNING id, item_id, name, price, is_active`
	row := h.pool.QueryRow(r.Context(), q, claims.TenantID, itemID, req.Name, req.Price)
	var m MenuItemModifier
	if err := row.Scan(&m.ID, &m.ItemID, &m.Name, &m.Price, &m.IsActive); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to create modifier")
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, m)
}

func (h *Handler) deleteCategory(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, err := parseID(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	const q = `UPDATE public.menu_categories SET is_active = false, updated_at = now()
		WHERE id = $1 AND tenant_id = $2`
	if _, err := h.pool.Exec(r.Context(), q, id, claims.TenantID); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to delete category")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// toggleCategoryActive flips is_active atomically. Replaces the legacy
// Supabase RPC `toggle_category_active(p_id)` so the web layer can drive
// reactivation via goFetch instead of supabase.rpc.
func (h *Handler) toggleCategoryActive(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, err := parseID(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	const q = `UPDATE public.menu_categories
		SET is_active = NOT is_active, updated_at = now()
		WHERE id = $1 AND tenant_id = $2
		RETURNING id, tenant_id, name, type, sort_order, is_active, created_at`
	row := h.pool.QueryRow(r.Context(), q, id, claims.TenantID)
	var c MenuCategory
	var catType sql.NullString
	var sortOrder sql.NullInt32
	var createdAt sql.NullTime
	if err := row.Scan(&c.ID, &c.TenantID, &c.Name, &catType, &sortOrder, &c.IsActive, &createdAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.WriteError(w, http.StatusNotFound, "category not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to toggle category")
		return
	}
	if catType.Valid {
		c.Type = catType.String
	}
	if sortOrder.Valid {
		c.SortOrder = int(sortOrder.Int32)
	}
	if createdAt.Valid {
		c.CreatedAt = createdAt.Time.String()
	}
	httputil.WriteJSON(w, http.StatusOK, c)
}

// toggleItemActive flips is_active atomically — sibling of toggleCategoryActive.
func (h *Handler) toggleItemActive(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, err := parseID(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	const q = `UPDATE public.menu_items
		SET is_active = NOT is_active, updated_at = now()
		WHERE id = $1 AND tenant_id = $2
		RETURNING id, tenant_id, category_id, name, description, base_price, image_url, is_active, created_at`
	row := h.pool.QueryRow(r.Context(), q, id, claims.TenantID)
	var item MenuItem
	var categoryID sql.NullInt64
	var description, imageURL sql.NullString
	var createdAt sql.NullTime
	if err := row.Scan(&item.ID, &item.TenantID, &categoryID, &item.Name, &description, &item.BasePrice, &imageURL, &item.IsActive, &createdAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.WriteError(w, http.StatusNotFound, "item not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to toggle item")
		return
	}
	if categoryID.Valid {
		item.CategoryID = categoryID.Int64
	}
	if description.Valid {
		item.Description = description.String
	}
	if imageURL.Valid {
		item.ImageURL = imageURL.String
	}
	if createdAt.Valid {
		item.CreatedAt = createdAt.Time.String()
	}
	httputil.WriteJSON(w, http.StatusOK, item)
}

// parseDailyLimitScope reads branchId query param + the menu item id, then
// verifies both belong to the caller's tenant. Daily limits are per-branch
// per-day; the menu item itself is tenant-scoped.
func (h *Handler) parseDailyLimitScope(r *http.Request, claims *auth.Claims) (menuItemID, branchID int64, status int, msg string) {
	id, err := parseID(r)
	if err != nil {
		return 0, 0, http.StatusBadRequest, "invalid id"
	}
	branchStr := r.URL.Query().Get("branchId")
	if branchStr == "" {
		return 0, 0, http.StatusBadRequest, "branchId query param required"
	}
	branchID, err = strconv.ParseInt(branchStr, 10, 64)
	if err != nil || branchID <= 0 {
		return 0, 0, http.StatusBadRequest, "invalid branchId"
	}

	var itemOK, branchOK bool
	if err := h.pool.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM public.menu_items WHERE id = $1 AND tenant_id = $2)`,
		id, claims.TenantID).Scan(&itemOK); err != nil || !itemOK {
		return 0, 0, http.StatusNotFound, "item not found"
	}
	if err := h.pool.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM public.branches WHERE id = $1 AND tenant_id = $2)`,
		branchID, claims.TenantID).Scan(&branchOK); err != nil || !branchOK {
		return 0, 0, http.StatusNotFound, "branch not found"
	}
	return id, branchID, 0, ""
}

func (h *Handler) getDailyLimit(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	itemID, branchID, status, msg := h.parseDailyLimitScope(r, claims)
	if status != 0 {
		httputil.WriteError(w, status, msg)
		return
	}

	// limit_date matches the table default — today in Asia/Ho_Chi_Minh.
	const q = `SELECT branch_id, menu_item_id, limit_date, limit_quantity, is_disabled, sold_today
		FROM public.branch_menu_item_daily_limits
		WHERE tenant_id = $1 AND branch_id = $2 AND menu_item_id = $3
		  AND limit_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`
	var row DailyLimitRow
	var limitDate sql.NullTime
	var limitQty sql.NullInt32
	err := h.pool.QueryRow(r.Context(), q, claims.TenantID, branchID, itemID).
		Scan(&row.BranchID, &row.MenuItemID, &limitDate, &limitQty, &row.IsDisabled, &row.SoldToday)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// No limit set for today → return defaults so the client can render an empty form.
			httputil.WriteJSON(w, http.StatusOK, DailyLimitRow{
				BranchID:   branchID,
				MenuItemID: itemID,
				LimitDate:  "",
				IsDisabled: false,
				SoldToday:  0,
			})
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to fetch daily limit")
		return
	}
	if limitDate.Valid {
		row.LimitDate = limitDate.Time.Format("2006-01-02")
	}
	if limitQty.Valid {
		v := limitQty.Int32
		row.LimitQuantity = &v
	}
	httputil.WriteJSON(w, http.StatusOK, row)
}

func (h *Handler) updateDailyLimit(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	itemID, branchID, status, msg := h.parseDailyLimitScope(r, claims)
	if status != 0 {
		httputil.WriteError(w, status, msg)
		return
	}

	var req SetDailyLimitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.LimitQuantity != nil && *req.LimitQuantity <= 0 {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "limit_quantity must be positive or null")
		return
	}

	// Bypass SECURITY DEFINER RPC (it depends on auth.* helpers that are NULL on
	// plain pgxpool connections — same trap that bit the notifications module).
	// Tenant/branch ownership is enforced above; the (branch_id, menu_item_id,
	// limit_date) UNIQUE is the upsert key.
	const q = `INSERT INTO public.branch_menu_item_daily_limits
			(tenant_id, branch_id, menu_item_id, limit_date, limit_quantity, is_disabled, sold_today)
		VALUES
			($1, $2, $3, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, $4, $5, 0)
		ON CONFLICT (branch_id, menu_item_id, limit_date) DO UPDATE
		SET limit_quantity = EXCLUDED.limit_quantity,
		    is_disabled    = EXCLUDED.is_disabled,
		    updated_at     = now()
		RETURNING branch_id, menu_item_id, limit_date, limit_quantity, is_disabled, sold_today`
	var row DailyLimitRow
	var limitDate sql.NullTime
	var limitQty sql.NullInt32
	if err := h.pool.QueryRow(r.Context(), q,
		claims.TenantID, branchID, itemID, req.LimitQuantity, req.IsDisabled,
	).Scan(&row.BranchID, &row.MenuItemID, &limitDate, &limitQty, &row.IsDisabled, &row.SoldToday); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to upsert daily limit")
		return
	}
	if limitDate.Valid {
		row.LimitDate = limitDate.Time.Format("2006-01-02")
	}
	if limitQty.Valid {
		v := limitQty.Int32
		row.LimitQuantity = &v
	}
	httputil.WriteJSON(w, http.StatusOK, row)
}
