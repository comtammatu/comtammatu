package middleware

import (
	"context"
	"log/slog"
	"net/http"
	"strings"

	"github.com/personal/comtammatu/backend/internal/auth"
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
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			claims, err := auth.ParseToken(token, jwtSecret)
			if err != nil {
				slog.WarnContext(r.Context(), "jwt validation failed", "err", err, "path", r.URL.Path)
				status := http.StatusUnauthorized
				if strings.Contains(err.Error(), "custom claims") {
					status = http.StatusForbidden
				}
				http.Error(w, `{"error":"unauthorized"}`, status)
				return
			}

			ctx := context.WithValue(r.Context(), claimsKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
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
