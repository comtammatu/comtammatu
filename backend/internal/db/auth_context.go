package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// WithAuthContext runs fn inside a transaction that pre-sets the PostgREST-style
// session variables that auth.uid() and auth.role() read. This makes the ~131
// SECURITY DEFINER RPCs that call auth.uid() internally work on a plain pgxpool
// connection (no PostgREST JWT middleware, no Supabase session).
//
// The caller supplies sub (JWT sub = users.uuid) and role (user_role string).
// Either may be empty — the functions tolerate NULL gracefully via nullif().
//
// Usage:
//
//	var result []byte
//	err := db.WithAuthContext(ctx, pool, sub, role, func(tx pgx.Tx) error {
//	    return tx.QueryRow(ctx, `SELECT public.create_payment(...)`, ...).Scan(&result)
//	})
func WithAuthContext(ctx context.Context, pool *pgxpool.Pool, sub, role string, fn func(pgx.Tx) error) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("db.WithAuthContext: begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx,
		`SELECT set_config('request.jwt.claim.sub', $1, true),
		        set_config('request.jwt.claim.role', $2, true)`,
		sub, role,
	); err != nil {
		return fmt.Errorf("db.WithAuthContext: set session vars: %w", err)
	}

	if err := fn(tx); err != nil {
		return err
	}

	return tx.Commit(ctx)
}
