package staff

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Handler serves staff management endpoints under /api/staff.
type Handler struct {
	db *pgxpool.Pool
}

// New constructs a Handler. db is stored for future DB wiring; no calls are made yet.
func New(db *pgxpool.Pool) *Handler {
	return &Handler{db: db}
}

// Routes returns a chi.Router with all staff sub-routes registered.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Get("/", h.listStaff)
	r.Post("/", h.createStaff)
	r.Get("/{id}", h.getStaff)
	r.Put("/{id}", h.updateStaff)
	r.Delete("/{id}", h.deactivateStaff)
	r.Get("/{id}/permissions", h.listPermissions)
	r.Post("/{id}/permissions", h.grantPermission)
	r.Delete("/{id}/permissions/{permKey}", h.revokePermission)

	return r
}

// notImplemented writes a 501 JSON response.
func notImplemented(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotImplemented)
	json.NewEncoder(w).Encode(map[string]string{"error": "not implemented"}) //nolint:errcheck
}

// writeError writes a 400 JSON error response.
func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg}) //nolint:errcheck
}

// listStaff handles GET / — list all staff for the authenticated tenant.
func (h *Handler) listStaff(w http.ResponseWriter, r *http.Request) {
	notImplemented(w)
}

// createStaff handles POST / — create a new staff member.
func (h *Handler) createStaff(w http.ResponseWriter, r *http.Request) {
	var req CreateStaffRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if strings.TrimSpace(req.FullName) == "" {
		writeError(w, http.StatusUnprocessableEntity, "full_name is required")
		return
	}
	if !strings.Contains(req.Email, "@") {
		writeError(w, http.StatusUnprocessableEntity, "email is invalid")
		return
	}
	if strings.TrimSpace(req.UserRole) == "" {
		writeError(w, http.StatusUnprocessableEntity, "user_role is required")
		return
	}

	notImplemented(w)
}

// getStaff handles GET /{id} — fetch a single staff member.
func (h *Handler) getStaff(w http.ResponseWriter, r *http.Request) {
	notImplemented(w)
}

// updateStaff handles PUT /{id} — update staff member fields.
func (h *Handler) updateStaff(w http.ResponseWriter, r *http.Request) {
	notImplemented(w)
}

// deactivateStaff handles DELETE /{id} — soft-delete (set is_active = false).
func (h *Handler) deactivateStaff(w http.ResponseWriter, r *http.Request) {
	notImplemented(w)
}

// listPermissions handles GET /{id}/permissions — list all permissions for a staff member.
func (h *Handler) listPermissions(w http.ResponseWriter, r *http.Request) {
	notImplemented(w)
}

// grantPermission handles POST /{id}/permissions — grant a permission to a staff member.
func (h *Handler) grantPermission(w http.ResponseWriter, r *http.Request) {
	var req GrantPermissionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if strings.TrimSpace(req.PermissionKey) == "" {
		writeError(w, http.StatusUnprocessableEntity, "permission_key is required")
		return
	}

	notImplemented(w)
}

// revokePermission handles DELETE /{id}/permissions/{permKey} — revoke a permission.
func (h *Handler) revokePermission(w http.ResponseWriter, r *http.Request) {
	notImplemented(w)
}
