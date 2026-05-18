// Package hddt implements the HĐĐT (Vietnamese e-invoice) daily B2C summary
// logic that is shared between the cron job and the admin manual-trigger handler.
//
// The MISA/Viettel HTTP provider call is intentionally NOT implemented here.
// Credentials and provider integration are blocked pending infra approval.
// See tasks/todo.md — "HDDT provider HTTP integration (MISA/Viettel)".
// Rows land in status='pending_provider_call' and the reconcile cron
// (hddt-reconcile) is responsible for picking them up once the provider
// is wired.
package hddt

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ictLocation is Asia/Ho_Chi_Minh (UTC+7), used to derive the local
// "today" / "yesterday" dates for summary_date.
var ictLocation = time.FixedZone("Asia/Ho_Chi_Minh", 7*60*60)

// RunDailySummaryForBranch executes the per-branch B2C summary flow:
//
//  1. INSERT a summary_run_queue row (status='queued', trigger_source='cron').
//  2. Call aggregate_daily_b2c_invoice RPC — creates draft tax_invoices row +
//     tax_invoice_orders junction, or returns skipped if no eligible orders /
//     already exists.
//  3. If skipped, mark queue row status='skipped' and return.
//  4. Transition tax_invoices draft → pending_provider_call via direct UPDATE
//     (the SECURITY DEFINER RPC transition_tax_invoice_state requires auth.uid();
//     the cron runs as the pgx pool role which has no JWT context — we bypass
//     by updating the status column directly as the pool role, which has been
//     granted UPDATE on tax_invoices by the migration).
//     TODO: once provider integration ships, replace the direct UPDATE with
//     db.WithAuthContext(...) + transition_tax_invoice_state RPC and then call
//     provider.createInvoice. See tasks/todo.md — "HDDT provider HTTP integration".
//  5. Mark queue row status='issued' (deferred pending provider), tax_invoice_id set.
//
// The function takes pool + tenant + branch only — no JWT context required
// because the cron runs as the pgxpool role that bypasses RLS.
// triggered_by is NULL (system actor = cron).
func RunDailySummaryForBranch(ctx context.Context, pool *pgxpool.Pool, tenantID, branchID int64) (summaryRunID int64, err error) {
	// yesterday in ICT time
	now := time.Now().In(ictLocation)
	yesterday := now.AddDate(0, 0, -1).Format("2006-01-02")

	tx, err := pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("hddt.RunDailySummaryForBranch: begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// 1. Insert summary_run_queue row
	err = tx.QueryRow(ctx, `
		INSERT INTO public.summary_run_queue
		  (tenant_id, branch_id, summary_date, status, trigger_source, attempt_count, started_at)
		VALUES ($1, $2, $3, 'running', 'cron', 1, now())
		RETURNING id`,
		tenantID, branchID, yesterday,
	).Scan(&summaryRunID)
	if err != nil {
		return 0, fmt.Errorf("hddt.RunDailySummaryForBranch: insert queue row: %w", err)
	}

	// 2. Call aggregate_daily_b2c_invoice RPC (returns JSONB — scan as []byte then unmarshal).
	type aggResult struct {
		Skipped      bool    `json:"skipped"`
		Reason       *string `json:"reason"`
		TaxInvoiceID *int64  `json:"tax_invoice_id"`
		OrderCount   *int    `json:"order_count"`
	}

	var aggRaw []byte
	err = tx.QueryRow(ctx, `
		SELECT public.aggregate_daily_b2c_invoice($1, $2)`,
		branchID, yesterday,
	).Scan(&aggRaw)
	if err != nil {
		_, _ = tx.Exec(ctx, `
			UPDATE public.summary_run_queue
			SET status='failed', last_error=$1, finished_at=now()
			WHERE id=$2`,
			err.Error(), summaryRunID)
		_ = tx.Commit(ctx)
		return summaryRunID, fmt.Errorf("hddt.RunDailySummaryForBranch: aggregate_daily_b2c_invoice: %w", err)
	}

	var agg aggResult
	if err = json.Unmarshal(aggRaw, &agg); err != nil {
		_, _ = tx.Exec(ctx, `
			UPDATE public.summary_run_queue
			SET status='failed', last_error=$1, finished_at=now()
			WHERE id=$2`,
			"rpc_json_unmarshal_failed", summaryRunID)
		_ = tx.Commit(ctx)
		return summaryRunID, fmt.Errorf("hddt.RunDailySummaryForBranch: unmarshal agg result: %w", err)
	}

	// 3. Skipped path
	if agg.Skipped {
		reason := ""
		if agg.Reason != nil {
			reason = *agg.Reason
		}
		var taxInvID *int64
		if agg.TaxInvoiceID != nil {
			taxInvID = agg.TaxInvoiceID
		}
		_, _ = tx.Exec(ctx, `
			UPDATE public.summary_run_queue
			SET status='skipped', last_error=$1, tax_invoice_id=$2, finished_at=now()
			WHERE id=$3`,
			reason, taxInvID, summaryRunID)
		if err := tx.Commit(ctx); err != nil {
			return summaryRunID, fmt.Errorf("hddt.RunDailySummaryForBranch: commit (skipped): %w", err)
		}
		slog.Info("hddt: summary skipped", "branch_id", branchID, "date", yesterday, "reason", reason, "queue_id", summaryRunID)
		return summaryRunID, nil
	}

	if agg.TaxInvoiceID == nil {
		msg := "aggregate_rpc_returned_nil_invoice_id"
		_, _ = tx.Exec(ctx, `
			UPDATE public.summary_run_queue
			SET status='failed', last_error=$1, finished_at=now()
			WHERE id=$2`,
			msg, summaryRunID)
		_ = tx.Commit(ctx)
		return summaryRunID, fmt.Errorf("hddt.RunDailySummaryForBranch: %s", msg)
	}

	taxInvoiceID := *agg.TaxInvoiceID

	// 4. Mark tax_invoices as pending_provider_call.
	// TODO: replace with db.WithAuthContext + transition_tax_invoice_state RPC
	// once MISA/Viettel provider HTTP integration ships.
	// Tracked: tasks/todo.md — "HDDT provider HTTP integration (MISA/Viettel)".
	_, err = tx.Exec(ctx, `
		UPDATE public.tax_invoices
		SET status = 'pending_provider_call'
		WHERE id = $1 AND status = 'draft'`,
		taxInvoiceID)
	if err != nil {
		_, _ = tx.Exec(ctx, `
			UPDATE public.summary_run_queue
			SET status='failed', last_error=$1, tax_invoice_id=$2, finished_at=now()
			WHERE id=$3`,
			err.Error(), taxInvoiceID, summaryRunID)
		_ = tx.Commit(ctx)
		return summaryRunID, fmt.Errorf("hddt.RunDailySummaryForBranch: mark pending_provider_call: %w", err)
	}

	// 5. Mark queue row issued (provider call deferred)
	_, err = tx.Exec(ctx, `
		UPDATE public.summary_run_queue
		SET status='issued', tax_invoice_id=$1, finished_at=now()
		WHERE id=$2`,
		taxInvoiceID, summaryRunID)
	if err != nil {
		return summaryRunID, fmt.Errorf("hddt.RunDailySummaryForBranch: update queue issued: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return summaryRunID, fmt.Errorf("hddt.RunDailySummaryForBranch: commit: %w", err)
	}

	slog.Info("hddt: summary run complete",
		"branch_id", branchID,
		"tenant_id", tenantID,
		"date", yesterday,
		"tax_invoice_id", taxInvoiceID,
		"queue_id", summaryRunID,
		"note", "provider_call_deferred_pending_integration",
	)
	return summaryRunID, nil
}
