// Package cron provides a process-local cron scheduler that wraps robfig/cron.
// Each registered job is guarded by a Postgres advisory lock so that multi-instance
// deployments never run the same job concurrently.
package cron

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/robfig/cron/v3"
)

const jobTimeout = 5 * time.Minute

// Scheduler wraps robfig/cron with a pgxpool for advisory-lock coordination.
type Scheduler struct {
	c    *cron.Cron
	pool *pgxpool.Pool
}

// New constructs a Scheduler whose internal cron runs in the Asia/Ho_Chi_Minh
// timezone. Panics if the timezone is unavailable (would indicate a broken OS).
func New(pool *pgxpool.Pool) *Scheduler {
	loc, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	if err != nil {
		panic("cron: failed to load Asia/Ho_Chi_Minh timezone: " + err.Error())
	}
	c := cron.New(cron.WithLocation(loc))
	return &Scheduler{c: c, pool: pool}
}

// Register adds a named job with the given cron spec. The job function receives
// a context that is cancelled after jobTimeout (5 min).
//
// Advisory-lock safety: before each invocation the scheduler acquires
// pg_try_advisory_lock(hashtext(name)). If the lock is not available (another
// instance is already running the job), the invocation is skipped with a log
// entry. The lock is released unconditionally when the job returns.
//
// Panic safety: a panic inside job is recovered and logged so a misbehaving
// job cannot crash the scheduler goroutine.
func (s *Scheduler) Register(name, spec string, job func(context.Context)) {
	_, err := s.c.AddFunc(spec, func() {
		ctx, cancel := context.WithTimeout(context.Background(), jobTimeout)
		defer cancel()

		// Acquire advisory lock — keyed by hashtext(name) for human-readable key.
		var acquired bool
		row := s.pool.QueryRow(ctx, "SELECT pg_try_advisory_lock(hashtext($1))", name)
		if err := row.Scan(&acquired); err != nil {
			slog.Error("cron: advisory lock query failed", "job", name, "err", err)
			return
		}
		if !acquired {
			slog.Info("cron: job skipped (lock held by another instance)", "job", name)
			return
		}
		defer func() {
			// Release on a fresh background context so a cancelled job ctx
			// does not block the unlock.
			unlockCtx, unlockCancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer unlockCancel()
			if _, err := s.pool.Exec(unlockCtx, "SELECT pg_advisory_unlock(hashtext($1))", name); err != nil {
				slog.Error("cron: advisory unlock failed", "job", name, "err", err)
			}
		}()

		// Recover panics so a crashing job doesn't take down the scheduler.
		defer func() {
			if r := recover(); r != nil {
				slog.Error("cron: job panicked", "job", name, "panic", r)
			}
		}()

		slog.Info("cron: job starting", "job", name)
		job(ctx)
		slog.Info("cron: job finished", "job", name)
	})
	if err != nil {
		// Invalid spec is a programming error — fail loudly at startup.
		panic("cron: invalid spec for job " + name + ": " + err.Error())
	}
	slog.Info("cron: job registered", "job", name, "spec", spec)
}

// Start begins the cron loop in a background goroutine.
func (s *Scheduler) Start() {
	s.c.Start()
	slog.Info("cron: scheduler started")
}

// Stop drains in-flight jobs and shuts down the scheduler. It blocks until
// all running jobs complete or ctx expires, whichever comes first.
func (s *Scheduler) Stop(ctx context.Context) error {
	stopCtx := s.c.Stop()
	select {
	case <-stopCtx.Done():
		slog.Info("cron: scheduler stopped cleanly")
		return nil
	case <-ctx.Done():
		slog.Warn("cron: scheduler stop timed out; some jobs may still be running")
		return ctx.Err()
	}
}
