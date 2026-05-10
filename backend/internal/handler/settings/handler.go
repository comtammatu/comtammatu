package settings

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/personal/comtammatu/backend/internal/httputil"
)

// Handler serves settings endpoints for branches and areas under /admin/settings.
type Handler struct {
	db *pgxpool.Pool
}

// New constructs a Handler. db is stored for future DB wiring; no calls are made yet.
func New(db *pgxpool.Pool) *Handler {
	return &Handler{db: db}
}

// Routes returns a chi.Router with all settings sub-routes registered.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Get("/branches", h.listBranches)
	r.Post("/branches", h.createBranch)
	r.Get("/branches/{id}", h.getBranch)
	r.Put("/branches/{id}", h.updateBranch)
	r.Delete("/branches/{id}", h.deactivateBranch)

	r.Get("/areas", h.listAreas)
	r.Post("/areas", h.createArea)
	r.Get("/areas/{id}", h.getArea)
	r.Put("/areas/{id}", h.updateArea)

	return r
}

func (h *Handler) listBranches(w http.ResponseWriter, _ *http.Request)   { httputil.NotImplemented(w) }
func (h *Handler) getBranch(w http.ResponseWriter, _ *http.Request)      { httputil.NotImplemented(w) }
func (h *Handler) updateBranch(w http.ResponseWriter, _ *http.Request)   { httputil.NotImplemented(w) }
func (h *Handler) deactivateBranch(w http.ResponseWriter, _ *http.Request) { httputil.NotImplemented(w) }
func (h *Handler) listAreas(w http.ResponseWriter, _ *http.Request)      { httputil.NotImplemented(w) }
func (h *Handler) getArea(w http.ResponseWriter, _ *http.Request)        { httputil.NotImplemented(w) }
func (h *Handler) updateArea(w http.ResponseWriter, _ *http.Request)     { httputil.NotImplemented(w) }

func (h *Handler) createBranch(w http.ResponseWriter, r *http.Request) {
	var req CreateBranchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "name is required")
		return
	}
	httputil.NotImplemented(w)
}

func (h *Handler) createArea(w http.ResponseWriter, r *http.Request) {
	var req CreateAreaRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "name is required")
		return
	}
	httputil.NotImplemented(w)
}
