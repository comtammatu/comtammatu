package auth

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/personal/comtammatu/backend/internal/middleware"
)

// Handler handles authentication-related HTTP endpoints.
type Handler struct{}

// New returns a new Handler.
func New() *Handler {
	return &Handler{}
}

// Routes returns a chi.Router wired with all auth endpoints.
// The caller is responsible for applying Authenticate middleware to protected routes.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/login", h.login)
	r.Get("/me", h.me)
	return r
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// login handles POST /auth/login.
func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "email and password are required")
		return
	}

	if strings.TrimSpace(req.Email) == "" || strings.TrimSpace(req.Password) == "" {
		writeError(w, http.StatusBadRequest, "email and password are required")
		return
	}
	if !strings.Contains(req.Email, "@") {
		writeError(w, http.StatusBadRequest, "email and password are required")
		return
	}

	writeError(w, http.StatusNotImplemented, "not implemented — Supabase signInWithPassword to be wired")
}

// me handles GET /auth/me.
func (h *Handler) me(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	writeJSON(w, http.StatusOK, MeResponse{
		TenantID: claims.TenantID,
		BranchID: claims.BranchID,
		UserRole: string(claims.UserRole),
		Position: claims.Position,
	})
}
