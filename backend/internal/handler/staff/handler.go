package staff

import (
	"encoding/json"
	"net/http"
	"net/mail"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/personal/comtammatu/backend/internal/httputil"
)

// Handler serves staff management endpoints under /admin/staff.
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

func (h *Handler) listStaff(w http.ResponseWriter, _ *http.Request)        { httputil.NotImplemented(w) }
func (h *Handler) getStaff(w http.ResponseWriter, _ *http.Request)         { httputil.NotImplemented(w) }
func (h *Handler) updateStaff(w http.ResponseWriter, _ *http.Request)      { httputil.NotImplemented(w) }
func (h *Handler) deactivateStaff(w http.ResponseWriter, _ *http.Request)  { httputil.NotImplemented(w) }
func (h *Handler) listPermissions(w http.ResponseWriter, _ *http.Request)  { httputil.NotImplemented(w) }
func (h *Handler) revokePermission(w http.ResponseWriter, _ *http.Request) { httputil.NotImplemented(w) }

func (h *Handler) createStaff(w http.ResponseWriter, r *http.Request) {
	var req CreateStaffRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.FullName) == "" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "full_name is required")
		return
	}
	if _, err := mail.ParseAddress(req.Email); err != nil {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "email is invalid")
		return
	}
	if strings.TrimSpace(req.UserRole) == "" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "user_role is required")
		return
	}
	httputil.NotImplemented(w)
}

func (h *Handler) grantPermission(w http.ResponseWriter, r *http.Request) {
	var req GrantPermissionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.PermissionKey) == "" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "permission_key is required")
		return
	}
	httputil.NotImplemented(w)
}
