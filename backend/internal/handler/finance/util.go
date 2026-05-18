package finance

import (
	"net/http"
	"regexp"
	"strconv"

	"github.com/personal/comtammatu/backend/internal/httputil"
)

var datePattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// isDate returns true if s matches YYYY-MM-DD.
func isDate(s string) bool {
	return datePattern.MatchString(s)
}

// requireIntQuery parses a required positive integer query param. On failure it
// writes a 400 and returns (0, false).
func requireIntQuery(w http.ResponseWriter, r *http.Request, key string) (int64, bool) {
	v := r.URL.Query().Get(key)
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil || n <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, key+" không hợp lệ")
		return 0, false
	}
	return n, true
}

// nullableIntQuery parses an optional positive integer query param.
// Returns nil when absent or invalid (callers pass nil to SQL for "all branches").
func nullableIntQuery(r *http.Request, key string) *int64 {
	v := r.URL.Query().Get(key)
	if v == "" {
		return nil
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil || n <= 0 {
		return nil
	}
	return &n
}

// requirePathInt parses a positive integer URL param (e.g. chi.URLParam).
// Returns (0, false) and writes 400 on failure.
func requirePathInt(w http.ResponseWriter, val string) (int64, bool) {
	n, err := strconv.ParseInt(val, 10, 64)
	if err != nil || n <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "ID không hợp lệ")
		return 0, false
	}
	return n, true
}
