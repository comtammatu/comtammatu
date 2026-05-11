package auth

import (
	"encoding/json"
	"net/http"
	"net/mail"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/personal/comtammatu/backend/internal/httputil"
	"github.com/personal/comtammatu/backend/internal/middleware"
)

// Handler handles authentication-related HTTP endpoints.
type Handler struct {
	pool *pgxpool.Pool
}

// New returns a new Handler.
func New(pool *pgxpool.Pool) *Handler {
	return &Handler{pool: pool}
}

// Login handles POST /auth/login.
// Mounted as a public route in main.go — no Authenticate middleware applied.
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	if h.pool != nil {
		h.loginWithPool(w, r)
		return
	}
	// stub: pool not wired yet — validate inputs and return 501
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
	httputil.NotImplemented(w)
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
