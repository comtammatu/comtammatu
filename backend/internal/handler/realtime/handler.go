// Package realtime provides the WebSocket endpoint for Go-native realtime.
// Flow: FE connects GET /ws?token=<jwt> → Hub.Subscribe → pump events as JSON frames.
package realtime

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"nhooyr.io/websocket"

	"github.com/personal/comtammatu/backend/internal/auth"
	"github.com/personal/comtammatu/backend/internal/httputil"
	"github.com/personal/comtammatu/backend/internal/realtime"
)

// Handler returns the GET /ws WebSocket handler. Authentication is via the
// ?token= query parameter because browsers cannot set the Authorization header
// during a WebSocket upgrade. The token is validated with the same ParseToken
// used by the HTTP Authenticate middleware.
func Handler(hub *realtime.Hub, jwtSecret string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := r.URL.Query().Get("token")
		if token == "" {
			httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		claims, err := auth.ParseToken(token, jwtSecret)
		if err != nil {
			slog.WarnContext(r.Context(), "ws: jwt validation failed", "err", err)
			httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		// Branch-scoped roles must have a branch_id; tenant-level roles get
		// branch_id=0 which the Hub matches via the tenant-wide (nil BranchID) path.
		var branchID int64
		if claims.BranchID != nil {
			branchID = *claims.BranchID
		}

		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			// Allow the FE origin — in production AllowedOrigins should be set.
			InsecureSkipVerify: true,
		})
		if err != nil {
			// websocket.Accept already wrote the HTTP error response.
			slog.WarnContext(r.Context(), "ws: upgrade failed", "err", err)
			return
		}

		sub := hub.Subscribe(claims.TenantID, branchID)
		defer hub.Unsubscribe(sub)

		ctx := conn.CloseRead(r.Context())

		enc := json.NewEncoder(nil) // used only for its Marshal calls below
		_ = enc

		slog.InfoContext(ctx, "ws: subscriber connected",
			"tenant_id", claims.TenantID, "branch_id", branchID)

		for {
			select {
			case <-ctx.Done():
				conn.Close(websocket.StatusNormalClosure, "done") //nolint:errcheck
				return
			case ev, ok := <-sub.C:
				if !ok {
					// Hub unsubscribed us.
					conn.Close(websocket.StatusNormalClosure, "done") //nolint:errcheck
					return
				}
				b, err := json.Marshal(ev)
				if err != nil {
					slog.ErrorContext(ctx, "ws: marshal failed", "err", err)
					continue
				}
				if err := conn.Write(ctx, websocket.MessageText, b); err != nil {
					// Client disconnected.
					return
				}
			}
		}
	}
}
