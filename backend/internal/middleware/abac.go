package middleware

import (
	"context"
	"net/http"

	"github.com/personal/comtammatu/backend/internal/httputil"
)

// PermissionChecker evaluates whether a user has a given permission.
type PermissionChecker interface {
	Can(ctx context.Context, userID, tenantID int64, branchID *int64, permKey string) (bool, error)
}

// RequirePermission returns middleware that enforces ABAC permission checks.
// Must run after Authenticate (requires claims in context).
func RequirePermission(checker PermissionChecker, permKey string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := ClaimsFrom(r.Context())
			if claims == nil {
				httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
				return
			}

			allowed, err := checker.Can(r.Context(), claims.UserID, claims.TenantID, claims.BranchID, permKey)
			if err != nil || !allowed {
				httputil.WriteError(w, http.StatusForbidden, "forbidden")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
