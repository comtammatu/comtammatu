package auth

import (
	"encoding/json"
	"net/http"
	"net/mail"
	"strings"

	"github.com/personal/comtammatu/backend/internal/httputil"
	"github.com/personal/comtammatu/backend/internal/middleware"
)

// Handler handles authentication-related HTTP endpoints.
type Handler struct{}

// New returns a new Handler.
func New() *Handler {
	return &Handler{}
}

// Login handles POST /auth/login.
// Mounted as a public route in main.go — no Authenticate middleware applied.
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "email and password are required")
		return
	}
	if strings.TrimSpace(req.Email) == "" || strings.TrimSpace(req.Password) == "" {
		httputil.WriteError(w, http.StatusBadRequest, "email and password are required")
		return
	}
	if _, err := mail.ParseAddress(req.Email); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "email and password are required")
		return
	}
	httputil.WriteError(w, http.StatusNotImplemented, "not implemented — Supabase signInWithPassword to be wired")
}

// Me handles GET /auth/me.
// Mounted behind Authenticate middleware in main.go.
func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, MeResponse{
		TenantID: claims.TenantID,
		BranchID: claims.BranchID,
		UserRole: string(claims.UserRole),
		Position: claims.Position,
	})
}
