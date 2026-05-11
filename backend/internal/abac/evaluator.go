package abac

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Permission holds one resolved permission entry for a user.
type Permission struct {
	Key      string
	BranchID *int64 // nil = applies to all branches
	Effect   string // "allow" | "deny"
}

// cachedPerms stores a user's resolved permissions with a TTL.
type cachedPerms struct {
	perms     []Permission
	expiresAt time.Time
}

// Evaluator resolves ABAC decisions for a user.
// It caches resolved permissions per user for 5 minutes to avoid per-request DB hits.
type Evaluator struct {
	pool  *pgxpool.Pool
	cache sync.Map // map[int64]*cachedPerms
}

// New creates an Evaluator backed by the given connection pool.
func New(pool *pgxpool.Pool) *Evaluator {
	return &Evaluator{pool: pool}
}

// Can returns true if the user identified by userID may perform permKey on the
// given branch (nil = tenant-wide operation).
func (e *Evaluator) Can(ctx context.Context, userID, tenantID int64, branchID *int64, permKey string) (bool, error) {
	perms, err := e.loadPerms(ctx, userID, tenantID)
	if err != nil {
		return false, err
	}
	return evaluate(perms, permKey, branchID), nil
}

// Invalidate clears the cached permissions for a user. Call after any
// user_permissions write so the next request picks up the change.
func (e *Evaluator) Invalidate(userID int64) {
	e.cache.Delete(userID)
}

// loadPerms returns permissions from cache or DB.
func (e *Evaluator) loadPerms(ctx context.Context, userID, tenantID int64) ([]Permission, error) {
	if v, ok := e.cache.Load(userID); ok {
		cp := v.(*cachedPerms)
		if time.Now().Before(cp.expiresAt) {
			return cp.perms, nil
		}
		e.cache.Delete(userID)
	}

	perms, err := e.queryPerms(ctx, userID, tenantID)
	if err != nil {
		return nil, err
	}

	e.cache.Store(userID, &cachedPerms{
		perms:     perms,
		expiresAt: time.Now().Add(5 * time.Minute),
	})
	return perms, nil
}

// queryPerms loads merged permissions from DB:
// 1. Role defaults from role_permission_defaults
// 2. User overrides from user_permissions (override role defaults)
// Active overrides win; among overrides, deny beats allow.
func (e *Evaluator) queryPerms(ctx context.Context, userID, tenantID int64) ([]Permission, error) {
	// Load role from users table, then merge role defaults + user overrides.
	const q = `
		WITH user_role AS (
			SELECT user_role FROM public.users WHERE id = $1 AND tenant_id = $2
		),
		role_defaults AS (
			SELECT rpd.permission_key AS key, NULL::BIGINT AS branch_id, rpd.effect
			FROM public.role_permission_defaults rpd
			JOIN user_role ur ON ur.user_role = rpd.role
		),
		user_overrides AS (
			SELECT permission_key AS key, branch_id, effect
			FROM public.user_permissions
			WHERE user_id = $1
			  AND tenant_id = $2
			  AND now() BETWEEN valid_from AND COALESCE(valid_until, 'infinity'::timestamptz)
		)
		SELECT key, branch_id, effect FROM user_overrides
		UNION ALL
		-- Role defaults only where no user override exists for this key
		SELECT rd.key, rd.branch_id, rd.effect FROM role_defaults rd
		WHERE NOT EXISTS (
			SELECT 1 FROM user_overrides uo WHERE uo.key = rd.key
		)`

	rows, err := e.pool.Query(ctx, q, userID, tenantID)
	if err != nil {
		// Table may not exist in test environment — return empty (deny all) gracefully
		return nil, fmt.Errorf("abac: query permissions: %w", err)
	}
	defer rows.Close()

	var perms []Permission
	for rows.Next() {
		var p Permission
		if err := rows.Scan(&p.Key, &p.BranchID, &p.Effect); err != nil {
			return nil, fmt.Errorf("abac: scan permission: %w", err)
		}
		perms = append(perms, p)
	}
	return perms, nil
}

// evaluate applies the permission list against a requested key+scope.
// Order: explicit deny → explicit allow → default deny.
func evaluate(perms []Permission, key string, branchID *int64) bool {
	// Pass 1: check for any deny that matches
	for _, p := range perms {
		if p.Key == key && p.Effect == "deny" && scopeMatches(p.BranchID, branchID) {
			return false
		}
	}
	// Pass 2: check for an allow that matches
	for _, p := range perms {
		if p.Key == key && p.Effect == "allow" && scopeMatches(p.BranchID, branchID) {
			return true
		}
	}
	return false // default deny
}

// scopeMatches returns true if the permission's branch scope covers the requested branch.
// A nil permission branch_id means "all branches" — it always matches.
func scopeMatches(permBranchID, requestBranchID *int64) bool {
	if permBranchID == nil {
		return true // permission applies to all branches
	}
	if requestBranchID == nil {
		return false // requesting tenant-wide op but permission is branch-scoped
	}
	return *permBranchID == *requestBranchID
}
