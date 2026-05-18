package cron

import (
	"context"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/personal/comtammatu/backend/internal/hddt"
)

// FeedbackDailyReport runs at 19:00 UTC (02:00 ICT) daily.
// Source: apps/web/app/api/cron/feedback-daily-report/route.ts
func FeedbackDailyReport(pool *pgxpool.Pool) func(context.Context) {
	return func(ctx context.Context) {
		slog.Info("cron: running FeedbackDailyReport")
		// TODO: port logic from apps/web/app/api/cron/feedback-daily-report/route.ts — deferred to a follow-up
		_ = pool
	}
}

// FeedbackRetention runs at 20:00 UTC (03:00 ICT) daily.
// Source: apps/web/app/api/cron/feedback-retention/route.ts
//
// Calls SECURITY DEFINER RPC public.feedback_retention_cleanup() which prunes
// phone/ip/row/outbox rows past the retention window. The function returns
// jsonb counters which we surface in the log line.
//
// Photo-object pruning from object storage is deferred to Phase E (R2 client
// is not yet wired). The TS route does this with supabase.storage which has
// no Go equivalent here yet.
func FeedbackRetention(pool *pgxpool.Pool) func(context.Context) {
	return func(ctx context.Context) {
		slog.Info("cron: running FeedbackRetention")
		var counters []byte
		if err := pool.QueryRow(ctx,
			`SELECT public.feedback_retention_cleanup()::text`,
		).Scan(&counters); err != nil {
			slog.Error("cron: FeedbackRetention: rpc failed", "err", err)
			return
		}
		slog.Info("cron: FeedbackRetention: done",
			"counters", string(counters),
			"photos_deferred", true,
		)
	}
}

// TelegramFlush runs every 5 minutes.
// Source: apps/web/app/api/cron/telegram-flush/route.ts
func TelegramFlush(pool *pgxpool.Pool) func(context.Context) {
	return func(ctx context.Context) {
		slog.Info("cron: running TelegramFlush")
		// TODO: port logic from apps/web/app/api/cron/telegram-flush/route.ts — deferred to a follow-up
		_ = pool
	}
}

// HDDTDailySummary runs at 19:00 UTC (02:00 ICT) daily.
// Source: apps/web/app/api/cron/hddt-daily-summary/route.ts
//
// For each active tenant + active branch, calls hddt.RunDailySummaryForBranch.
// Branch failures are isolated: one branch failing does not stop others.
//
// MISA/Viettel provider HTTP call is deferred — runs land in
// status='pending_provider_call' and are picked up by the reconcile cron.
// See tasks/todo.md — "HDDT provider HTTP integration (MISA/Viettel)".
func HDDTDailySummary(pool *pgxpool.Pool) func(context.Context) {
	return func(ctx context.Context) {
		slog.Info("cron: running HDDTDailySummary")

		// Fetch all active tenants.
		tenantRows, err := pool.Query(ctx, `
			SELECT id FROM public.tenants WHERE is_active = true`)
		if err != nil {
			slog.Error("cron: HDDTDailySummary: query tenants", "err", err)
			return
		}
		defer tenantRows.Close()

		var tenantIDs []int64
		for tenantRows.Next() {
			var id int64
			if err := tenantRows.Scan(&id); err != nil {
				slog.Error("cron: HDDTDailySummary: scan tenant", "err", err)
				return
			}
			tenantIDs = append(tenantIDs, id)
		}
		tenantRows.Close()

		for _, tenantID := range tenantIDs {
			// Fetch active branches for this tenant.
			branchRows, err := pool.Query(ctx, `
				SELECT id FROM public.branches
				WHERE tenant_id = $1 AND is_active = true`,
				tenantID)
			if err != nil {
				slog.Error("cron: HDDTDailySummary: query branches", "tenant_id", tenantID, "err", err)
				continue
			}

			var branchIDs []int64
			for branchRows.Next() {
				var id int64
				if err := branchRows.Scan(&id); err != nil {
					slog.Error("cron: HDDTDailySummary: scan branch", "tenant_id", tenantID, "err", err)
					break
				}
				branchIDs = append(branchIDs, id)
			}
			branchRows.Close()

			for _, branchID := range branchIDs {
				queueID, err := hddt.RunDailySummaryForBranch(ctx, pool, tenantID, branchID)
				if err != nil {
					// Skip-and-continue: one branch failure must not block others.
					slog.Error("cron: HDDTDailySummary: branch failed",
						"tenant_id", tenantID,
						"branch_id", branchID,
						"queue_id", queueID,
						"err", err,
					)
					continue
				}
				slog.Info("cron: HDDTDailySummary: branch done",
					"tenant_id", tenantID,
					"branch_id", branchID,
					"queue_id", queueID,
				)
			}
		}
	}
}
