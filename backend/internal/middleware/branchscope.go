package middleware

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/personal/comtammatu/backend/internal/auth"
	"github.com/personal/comtammatu/backend/internal/httputil"
)

// RequireBranchScope enforces that a branch-scoped caller can only act on their
// own branch. Tenant-level roles (owner, super_manager, area_manager, office)
// may traverse any branch within their tenant; every other role must carry a
// JWT branch_id that matches the {branchId} URL parameter.
//
// Mirrors the branch-scope gate in apps/web/proxy.ts. Must run after
// Authenticate and only on routes whose pattern includes {branchId}.
func RequireBranchScope(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims := ClaimsFrom(r.Context())
		if claims == nil {
			httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		// Tenant-level roles operate across the whole tenant, not one branch.
		if auth.TenantLevelRoles[claims.UserRole] {
			next.ServeHTTP(w, r)
			return
		}

		urlBranchID, err := strconv.ParseInt(chi.URLParam(r, "branchId"), 10, 64)
		if err != nil {
			httputil.WriteError(w, http.StatusBadRequest, "invalid branch id")
			return
		}

		if claims.BranchID == nil || *claims.BranchID != urlBranchID {
			httputil.WriteError(w, http.StatusForbidden, "forbidden: branch scope mismatch")
			return
		}

		next.ServeHTTP(w, r)
	})
}
