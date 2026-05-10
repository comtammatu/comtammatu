package menu

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/personal/comtammatu/backend/internal/httputil"
)

// Handler handles menu-related HTTP endpoints.
type Handler struct {
	pool *pgxpool.Pool
}

// New returns a new Handler. The pool is stored for future DB wiring.
func New(pool *pgxpool.Pool) *Handler {
	return &Handler{pool: pool}
}

// Routes returns a chi.Router wired with all menu endpoints.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Get("/categories", h.listCategories)
	r.Post("/categories", h.createCategory)
	r.Get("/categories/{id}", h.getCategory)
	r.Put("/categories/{id}", h.updateCategory)

	r.Get("/items", h.listItems)
	r.Post("/items", h.createItem)
	r.Get("/items/{id}", h.getItem)
	r.Put("/items/{id}", h.updateItem)
	r.Delete("/items/{id}", h.deleteItem)

	r.Get("/items/{id}/variants", h.listVariants)
	r.Post("/items/{id}/variants", h.createVariant)

	r.Get("/items/{id}/modifiers", h.listModifiers)
	r.Post("/items/{id}/modifiers", h.createModifier)

	return r
}

func (h *Handler) listCategories(w http.ResponseWriter, _ *http.Request) { httputil.NotImplemented(w) }
func (h *Handler) getCategory(w http.ResponseWriter, _ *http.Request)    { httputil.NotImplemented(w) }
func (h *Handler) updateCategory(w http.ResponseWriter, _ *http.Request) { httputil.NotImplemented(w) }
func (h *Handler) listItems(w http.ResponseWriter, _ *http.Request)      { httputil.NotImplemented(w) }
func (h *Handler) getItem(w http.ResponseWriter, _ *http.Request)        { httputil.NotImplemented(w) }
func (h *Handler) updateItem(w http.ResponseWriter, _ *http.Request)     { httputil.NotImplemented(w) }
func (h *Handler) deleteItem(w http.ResponseWriter, _ *http.Request)     { httputil.NotImplemented(w) }
func (h *Handler) listVariants(w http.ResponseWriter, _ *http.Request)   { httputil.NotImplemented(w) }
func (h *Handler) createVariant(w http.ResponseWriter, _ *http.Request)  { httputil.NotImplemented(w) }
func (h *Handler) listModifiers(w http.ResponseWriter, _ *http.Request)  { httputil.NotImplemented(w) }
func (h *Handler) createModifier(w http.ResponseWriter, _ *http.Request) { httputil.NotImplemented(w) }

func (h *Handler) createCategory(w http.ResponseWriter, r *http.Request) {
	var req CreateMenuCategoryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		httputil.WriteError(w, http.StatusBadRequest, "name is required")
		return
	}
	httputil.NotImplemented(w)
}

func (h *Handler) createItem(w http.ResponseWriter, r *http.Request) {
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
	httputil.NotImplemented(w)
}
