package auth

import (
	"encoding/json"
	"net/http"
	"net/mail"
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
// /login is public; /me must be placed behind Authenticate middleware by the caller (see main.go).
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/login", h.Login)
	r.Get("/me", h.Me)
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

// Login handles POST /auth/login.
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "email and password are required")
		return
	}

	if strings.TrimSpace(req.Email) == "" || strings.TrimSpace(req.Password) == "" {
		writeError(w, http.StatusBadRequest, "email and password are required")
		return
	}
	if _, err := mail.ParseAddress(req.Email); err != nil {
		writeError(w, http.StatusBadRequest, "email and password are required")
		return
	}

	writeError(w, http.StatusNotImplemented, "not implemented — Supabase signInWithPassword to be wired")
}

// Me handles GET /auth/me.
func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
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
