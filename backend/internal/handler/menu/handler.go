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
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/personal/comtammatu/backend/internal/httputil"
	"github.com/personal/comtammatu/backend/internal/middleware"
)

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

	r.With(read).Get("/items", h.listItems)
	r.With(write).Post("/items", h.createItem)
	r.With(read).Get("/items/{id}", h.getItem)
	r.With(write).Put("/items/{id}", h.updateItem)
	r.With(write).Delete("/items/{id}", h.deleteItem)

	r.With(read).Get("/items/{id}/variants", h.listVariants)
	r.With(write).Post("/items/{id}/variants", h.createVariant)

	r.With(read).Get("/items/{id}/modifiers", h.listModifiers)
	r.With(write).Post("/items/{id}/modifiers", h.createModifier)

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
	const q = `SELECT id, tenant_id, name, sort_order, is_active, created_at
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
		var sortOrder sql.NullInt32
		var createdAt sql.NullTime
		if err := rows.Scan(&c.ID, &c.TenantID, &c.Name, &sortOrder, &c.IsActive, &createdAt); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read categories")
			return
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
	const q = `SELECT id, tenant_id, name, sort_order, is_active, created_at
		FROM public.menu_categories
		WHERE id = $1 AND tenant_id = $2`
	row := h.pool.QueryRow(r.Context(), q, id, claims.TenantID)
	var c MenuCategory
	var sortOrder sql.NullInt32
	var createdAt sql.NullTime
	if err := row.Scan(&c.ID, &c.TenantID, &c.Name, &sortOrder, &c.IsActive, &createdAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.WriteError(w, http.StatusNotFound, "category not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to fetch category")
		return
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
	const q = `INSERT INTO public.menu_categories (tenant_id, name, sort_order)
		VALUES ($1, $2, $3)
		RETURNING id, tenant_id, name, sort_order, is_active, created_at`
	row := h.pool.QueryRow(r.Context(), q, claims.TenantID, req.Name, req.SortOrder)
	var c MenuCategory
	var sortOrder sql.NullInt32
	var createdAt sql.NullTime
	if err := row.Scan(&c.ID, &c.TenantID, &c.Name, &sortOrder, &c.IsActive, &createdAt); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to create category")
		return
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
	var req struct {
		Name      *string `json:"name"`
		SortOrder *int    `json:"sort_order"`
		IsActive  *bool   `json:"is_active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	const q = `UPDATE public.menu_categories
		SET name = COALESCE($1, name),
		    sort_order = COALESCE($2, sort_order),
		    is_active = COALESCE($3, is_active),
		    updated_at = now()
		WHERE id = $4 AND tenant_id = $5
		RETURNING id, tenant_id, name, sort_order, is_active, created_at`
	var nameArg *string
	if req.Name != nil {
		nameArg = req.Name
	}
	row := h.pool.QueryRow(r.Context(), q, nameArg, req.SortOrder, req.IsActive, id, claims.TenantID)
	var c MenuCategory
	var sortOrder sql.NullInt32
	var createdAt sql.NullTime
	if err := row.Scan(&c.ID, &c.TenantID, &c.Name, &sortOrder, &c.IsActive, &createdAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.WriteError(w, http.StatusNotFound, "category not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to update category")
		return
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
	const q = `SELECT id, tenant_id, category_id, name, description, base_price, is_active, created_at
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
		var description sql.NullString
		var createdAt sql.NullTime
		if err := rows.Scan(&item.ID, &item.TenantID, &categoryID, &item.Name, &description, &item.BasePrice, &item.IsActive, &createdAt); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read items")
			return
		}
		if categoryID.Valid {
			item.CategoryID = categoryID.Int64
		}
		if description.Valid {
			item.Description = description.String
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
	const q = `SELECT id, tenant_id, category_id, name, description, base_price, is_active, created_at
		FROM public.menu_items
		WHERE id = $1 AND tenant_id = $2`
	row := h.pool.QueryRow(r.Context(), q, id, claims.TenantID)
	var item MenuItem
	var categoryID sql.NullInt64
	var description sql.NullString
	var createdAt sql.NullTime
	if err := row.Scan(&item.ID, &item.TenantID, &categoryID, &item.Name, &description, &item.BasePrice, &item.IsActive, &createdAt); err != nil {
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
	const q = `INSERT INTO public.menu_items (tenant_id, category_id, name, description, base_price)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, tenant_id, category_id, name, description, base_price, is_active, created_at`
	var desc *string
	if req.Description != "" {
		desc = &req.Description
	}
	row := h.pool.QueryRow(r.Context(), q, claims.TenantID, req.CategoryID, req.Name, desc, req.BasePrice)
	var item MenuItem
	var categoryID sql.NullInt64
	var description sql.NullString
	var createdAt sql.NullTime
	if err := row.Scan(&item.ID, &item.TenantID, &categoryID, &item.Name, &description, &item.BasePrice, &item.IsActive, &createdAt); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to create item")
		return
	}
	if categoryID.Valid {
		item.CategoryID = categoryID.Int64
	}
	if description.Valid {
		item.Description = description.String
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
		    description = COALESCE($2, description),
		    base_price = COALESCE($3, base_price),
		    is_active = COALESCE($4, is_active),
		    updated_at = now()
		WHERE id = $5 AND tenant_id = $6
		RETURNING id, tenant_id, category_id, name, description, base_price, is_active, created_at`
	row := h.pool.QueryRow(r.Context(), q, req.Name, req.Description, req.BasePrice, req.IsActive, id, claims.TenantID)
	var item MenuItem
	var categoryID sql.NullInt64
	var description sql.NullString
	var createdAt sql.NullTime
	if err := row.Scan(&item.ID, &item.TenantID, &categoryID, &item.Name, &description, &item.BasePrice, &item.IsActive, &createdAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.WriteError(w, http.StatusNotFound, "item not found")
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
