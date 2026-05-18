package cron

import (
	"context"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"
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
func FeedbackRetention(pool *pgxpool.Pool) func(context.Context) {
	return func(ctx context.Context) {
		slog.Info("cron: running FeedbackRetention")
		// TODO: port logic from apps/web/app/api/cron/feedback-retention/route.ts — deferred to a follow-up
		_ = pool
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
func HDDTDailySummary(pool *pgxpool.Pool) func(context.Context) {
	return func(ctx context.Context) {
		slog.Info("cron: running HDDTDailySummary")
		// TODO: port logic from apps/web/app/api/cron/hddt-daily-summary/route.ts — deferred to a follow-up
		_ = pool
	}
}
