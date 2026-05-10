package health

import (
	"encoding/json"
	"net/http"
	"time"
)

type response struct {
	Status    string `json:"status"`
	Timestamp string `json:"timestamp"`
	Service   string `json:"service"`
}

// Handler returns a simple health-check handler.
// GET /health → 200 {"status":"ok","timestamp":"...","service":"comtammatu-backend"}
func Handler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response{ //nolint:errcheck
			Status:    "ok",
			Timestamp: time.Now().UTC().Format(time.RFC3339),
			Service:   "comtammatu-backend",
		})
	}
}
