package settings

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Handler serves settings endpoints for branches and areas under /api/settings.
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

	// Branch routes
	r.Get("/branches", h.listBranches)
	r.Post("/branches", h.createBranch)
	r.Get("/branches/{id}", h.getBranch)
	r.Put("/branches/{id}", h.updateBranch)
	r.Delete("/branches/{id}", h.deactivateBranch)

	// Area routes
	r.Get("/areas", h.listAreas)
	r.Post("/areas", h.createArea)
	r.Get("/areas/{id}", h.getArea)
	r.Put("/areas/{id}", h.updateArea)

	return r
}

// notImplemented writes a 501 JSON response.
func notImplemented(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotImplemented)
	json.NewEncoder(w).Encode(map[string]string{"error": "not implemented"}) //nolint:errcheck
}

// writeError writes a JSON error response with the given status code.
func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg}) //nolint:errcheck
}

// listBranches handles GET /branches — list all branches for the authenticated tenant.
func (h *Handler) listBranches(w http.ResponseWriter, r *http.Request) {
	notImplemented(w)
}

// createBranch handles POST /branches — create a new branch.
func (h *Handler) createBranch(w http.ResponseWriter, r *http.Request) {
	var req CreateBranchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if strings.TrimSpace(req.Name) == "" {
		writeError(w, http.StatusUnprocessableEntity, "name is required")
		return
	}

	notImplemented(w)
}

// getBranch handles GET /branches/{id} — fetch a single branch.
func (h *Handler) getBranch(w http.ResponseWriter, r *http.Request) {
	notImplemented(w)
}

// updateBranch handles PUT /branches/{id} — update branch fields.
func (h *Handler) updateBranch(w http.ResponseWriter, r *http.Request) {
	notImplemented(w)
}

// deactivateBranch handles DELETE /branches/{id} — soft-delete (set is_active = false).
func (h *Handler) deactivateBranch(w http.ResponseWriter, r *http.Request) {
	notImplemented(w)
}

// listAreas handles GET /areas — list all areas for the authenticated tenant.
func (h *Handler) listAreas(w http.ResponseWriter, r *http.Request) {
	notImplemented(w)
}

// createArea handles POST /areas — create a new area.
func (h *Handler) createArea(w http.ResponseWriter, r *http.Request) {
	var req CreateAreaRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if strings.TrimSpace(req.Name) == "" {
		writeError(w, http.StatusUnprocessableEntity, "name is required")
		return
	}

	notImplemented(w)
}

// getArea handles GET /areas/{id} — fetch a single area.
func (h *Handler) getArea(w http.ResponseWriter, r *http.Request) {
	notImplemented(w)
}

// updateArea handles PUT /areas/{id} — update area fields.
func (h *Handler) updateArea(w http.ResponseWriter, r *http.Request) {
	notImplemented(w)
}
