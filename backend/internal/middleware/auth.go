package middleware

import (
	"context"
	"log/slog"
	"net/http"
	"strings"

	"github.com/personal/comtammatu/backend/internal/auth"
	"github.com/personal/comtammatu/backend/internal/httputil"
)

type contextKey string

const claimsKey contextKey = "claims"

// Authenticate validates the Supabase JWT from the Authorization header and
// injects the parsed claims into the request context. Requests without a valid
// token receive 401; requests with a valid token but missing custom claims
// (hook not fired) receive 403.
func Authenticate(jwtSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := extractBearer(r)
			if token == "" {
				httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
				return
			}

			claims, err := auth.ParseToken(token, jwtSecret)
			if err != nil {
				slog.WarnContext(r.Context(), "jwt validation failed", "err", err, "path", r.URL.Path)
				status := http.StatusUnauthorized
				if strings.Contains(err.Error(), "custom claims") {
					status = http.StatusForbidden
				}
				httputil.WriteError(w, status, "unauthorized")
				return
			}

			ctx := context.WithValue(r.Context(), claimsKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireModule enforces coarse route ACL after Authenticate has attached claims.
func RequireModule(module auth.ModuleKey) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := ClaimsFrom(r.Context())
			if claims == nil {
				httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			if !auth.CanAccess(claims.UserRole, module) {
				httputil.WriteError(w, http.StatusForbidden, "forbidden")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// ClaimsFrom retrieves parsed JWT claims from the request context.
// Returns nil if Authenticate middleware was not applied.
func ClaimsFrom(ctx context.Context) *auth.Claims {
	c, _ := ctx.Value(claimsKey).(*auth.Claims)
	return c
}

func extractBearer(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if after, ok := strings.CutPrefix(h, "Bearer "); ok {
		return strings.TrimSpace(after)
	}
	return ""
}
