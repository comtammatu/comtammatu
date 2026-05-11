package middleware

import (
	"net/http"
	"slices"
	"strings"
)

// CORS returns a middleware that sets CORS headers for the allowed origins.
// Pass the list of allowed origins from ALLOWED_ORIGINS env var (comma-separated).
// Credentials are always supported so the frontend can send the httpOnly auth cookie.
func CORS(allowedOrigins []string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")

			if origin != "" && slices.Contains(allowedOrigins, origin) {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
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

// ParseOrigins splits a comma-separated origins string into a slice.
func ParseOrigins(raw string) []string {
	var out []string
	for s := range strings.SplitSeq(raw, ",") {
		if trimmed := strings.TrimSpace(s); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func ContainsWildcardOrigin(origins []string) bool {
	return slices.Contains(origins, "*")
}
