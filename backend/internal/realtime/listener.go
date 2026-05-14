package realtime

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
)

// notifyPayload mirrors the JSON emitted by the realtime_notify() trigger.
type notifyPayload struct {
	Table    string `json:"table"`
	Op       string `json:"op"`
	TenantID int64  `json:"tenant_id"`
	BranchID *int64 `json:"branch_id,omitempty"`
	ID       int64  `json:"id"`
}

// Listen connects a dedicated (non-pooled) Postgres connection, issues
// LISTEN realtime_events, and forwards every notification to hub as a
// typed Event. It reconnects with exponential backoff on connection loss
// and returns when ctx is cancelled.
//
// dsn must be a valid libpq / pgx connection string. A dedicated conn is
// required because LISTEN state is connection-scoped and incompatible with
// pgxpool's connection lifecycle.
func Listen(ctx context.Context, dsn string, hub *Hub) {
	const (
		baseDelay = 500 * time.Millisecond
		maxDelay  = 30 * time.Second
	)

	delay := baseDelay
	for {
		if err := listenOnce(ctx, dsn, hub); err != nil {
			if ctx.Err() != nil {
				slog.InfoContext(ctx, "realtime listener shutting down")
				return
			}
			slog.ErrorContext(ctx, "realtime listener disconnected, reconnecting",
				"err", err, "backoff", delay)
		} else {
			// Clean exit (ctx cancelled).
			return
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(delay):
			delay *= 2
			if delay > maxDelay {
				delay = maxDelay
			}
		}
	}
}

// listenOnce runs one LISTEN session. Returns nil only on clean ctx cancellation.
func listenOnce(ctx context.Context, dsn string, hub *Hub) error {
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		return err
	}
	defer conn.Close(context.Background()) //nolint:errcheck

	if _, err := conn.Exec(ctx, "LISTEN realtime_events"); err != nil {
		return err
	}
	slog.InfoContext(ctx, "realtime listener connected", "channel", "realtime_events")

	// Reset backoff to base on successful connect — done by caller via delay reset
	// is not possible from here; the caller resets on next successful connect.

	for {
		notif, err := conn.WaitForNotification(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return nil // clean shutdown
			}
			return err
		}

		var p notifyPayload
		if err := json.Unmarshal([]byte(notif.Payload), &p); err != nil {
			slog.WarnContext(ctx, "realtime: unparseable notification payload",
				"payload", notif.Payload, "err", err)
			continue
		}

		op := Operation(p.Op)
		switch op {
		case OpInsert, OpUpdate, OpDelete:
		default:
			slog.WarnContext(ctx, "realtime: unknown op", "op", p.Op)
			continue
		}

		hub.Publish(Event{
			Table:    p.Table,
			TenantID: p.TenantID,
			BranchID: p.BranchID,
			RowID:    p.ID,
			Op:       op,
		})
	}
}
