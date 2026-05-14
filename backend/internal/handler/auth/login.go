package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/personal/comtammatu/backend/internal/httputil"
	"golang.org/x/crypto/bcrypt"
)

// userRow is the subset of public.users we need for login.
type userRow struct {
	ID           int64
	TenantID     int64
	BranchID     *int64
	Email        string
	PasswordHash string
	FullName     string
	UserRole     string
	Position     *string
	IsActive     bool
	UUID         string
}

func (h *Handler) loginWithPool(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Email == "" || req.Password == "" {
		httputil.WriteError(w, http.StatusBadRequest, "email and password are required")
		return
	}
	if req.TenantID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	user, err := getUserByEmail(r.Context(), h.pool, req.Email, req.TenantID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.WriteError(w, http.StatusUnauthorized, "invalid credentials")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "authentication failed")
		return
	}

	if user.PasswordHash == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "account not activated — set a password first")
		return
	}

	if !user.IsActive {
		httputil.WriteError(w, http.StatusUnauthorized, "account is deactivated")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		httputil.WriteError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	token, err := signToken(user)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to issue token")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"token":     token,
		"user_role": user.UserRole,
		"tenant_id": user.TenantID,
		"branch_id": user.BranchID,
	})
}

func getUserByEmail(ctx context.Context, pool *pgxpool.Pool, email string, tenantID int64) (*userRow, error) {
	const q = `
        SELECT id, tenant_id, branch_id, email, password_hash, full_name, user_role, position, is_active, uuid
        FROM public.users
        WHERE email = $1 AND tenant_id = $2`
	row := pool.QueryRow(ctx, q, email, tenantID)
	var u userRow
	err := row.Scan(&u.ID, &u.TenantID, &u.BranchID, &u.Email, &u.PasswordHash,
		&u.FullName, &u.UserRole, &u.Position, &u.IsActive, &u.UUID)
	return &u, err
}

func signToken(u *userRow) (string, error) {
	secret := os.Getenv("SUPABASE_JWT_SECRET")
	if secret == "" {
		return "", errors.New("JWT secret not configured")
	}

	pos := ""
	if u.Position != nil {
		pos = *u.Position
	}

	type customClaims struct {
		jwt.RegisteredClaims
		UserID   int64  `json:"user_id"`
		TenantID int64  `json:"tenant_id"`
		BranchID *int64 `json:"branch_id"`
		UserRole string `json:"user_role"`
		Position string `json:"position,omitempty"`
	}

	claims := customClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   u.UUID,
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
		UserID:   u.ID,
		TenantID: u.TenantID,
		BranchID: u.BranchID,
		UserRole: u.UserRole,
		Position: pos,
	}

	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
}
