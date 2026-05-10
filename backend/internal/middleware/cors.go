package middleware

import (
	"net/http"
	"slices"
	"strings"
)

// CORS returns a middleware that sets CORS headers for the allowed origins.
// Pass the list of allowed origins from ALLOWED_ORIGINS env var (comma-separated).
// In development, pass []string{"*"} to allow all origins.
//
// Credentials are always supported so the frontend can send the httpOnly auth cookie.
func CORS(allowedOrigins []string) func(http.Handler) http.Handler {
	allowAll := slices.Contains(allowedOrigins, "*")

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")

			if allowAll || slices.Contains(allowedOrigins, origin) {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-ID")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			}

			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// parseOrigins splits a comma-separated origins string into a slice.
func ParseOrigins(raw string) []string {
	var out []string
	for s := range strings.SplitSeq(raw, ",") {
		if trimmed := strings.TrimSpace(s); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}
