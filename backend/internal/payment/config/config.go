// Package config loads per-tenant payment provider settings from the
// system_settings table, with optional env-var fallback that matches the
// behaviour of apps/web/app/br/[branchId]/pos/payment-actions.ts (which falls
// back to VIETQR_* and MOMO_* env vars when system_settings rows are absent).
package config

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// system_settings keys — kept in lockstep with packages/shared/src/auth/permissions.ts
// and apps/web/app/admin/settings/payments/actions.ts.
const (
	keyEnableMoMo        = "PAYMENT_ENABLE_MOMO"
	keyEnableVietQR      = "PAYMENT_ENABLE_VIETQR"
	keyMoMoPartnerCode   = "PAYMENT_MOMO_PARTNER_CODE"
	keyMoMoAccessKey     = "PAYMENT_MOMO_ACCESS_KEY"
	keyMoMoSecretKey     = "PAYMENT_MOMO_SECRET_KEY"
	keyMoMoSandbox       = "PAYMENT_MOMO_SANDBOX"
	keyVietQRBankCode    = "PAYMENT_VIETQR_BANK_CODE"
	keyVietQRAccountNo   = "PAYMENT_VIETQR_ACCOUNT_NO"
	keyVietQRAccountName = "PAYMENT_VIETQR_ACCOUNT_NAME"
)

// VietQR is the bank config returned by GET /br/{branchId}/payments/vietqr-config.
// Bank credentials are not secrets (they're printed on every receipt) so all
// fields are safe to expose to authenticated cashiers.
type VietQR struct {
	BankCode    string `json:"bank_code"`
	AccountNo   string `json:"account_no"`
	AccountName string `json:"account_name"`
}

// MoMo is the per-tenant MoMo Payment Gateway config. SecretKey is never
// included in API responses — handlers must pick out only PartnerCode +
// AccessKey + Sandbox + a derived SecretKeySet bool when serialising.
type MoMo struct {
	PartnerCode string `json:"partner_code"`
	AccessKey   string `json:"access_key"`
	SecretKey   string `json:"-"`
	Sandbox     bool   `json:"sandbox"`
}

// Payment is the consolidated tenant payment config.
type Payment struct {
	EnableMoMo   bool   `json:"enable_momo"`
	EnableVietQR bool   `json:"enable_vietqr"`
	MoMo         MoMo   `json:"momo"`
	VietQR       VietQR `json:"vietqr"`
}

// Load fetches PAYMENT_* keys for tenantID from system_settings and falls back
// to the matching env vars when a row is absent. Returns a fully-populated
// Payment value (zero values for missing keys, never an error for "not
// configured" — the handler decides what to do with enable_*=false).
func Load(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (Payment, error) {
	keys := []string{
		keyEnableMoMo, keyEnableVietQR,
		keyMoMoPartnerCode, keyMoMoAccessKey, keyMoMoSecretKey, keyMoMoSandbox,
		keyVietQRBankCode, keyVietQRAccountNo, keyVietQRAccountName,
	}
	const q = `SELECT key, value FROM public.system_settings WHERE tenant_id = $1 AND key = ANY($2::text[])`
	rows, err := pool.Query(ctx, q, tenantID, keys)
	if err != nil {
		return Payment{}, fmt.Errorf("payment/config: query system_settings: %w", err)
	}
	defer rows.Close()
	values := make(map[string]string, len(keys))
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return Payment{}, fmt.Errorf("payment/config: scan row: %w", err)
		}
		values[k] = v
	}
	if err := rows.Err(); err != nil {
		return Payment{}, fmt.Errorf("payment/config: rows: %w", err)
	}

	// Provider-scoped fallback gating: env vars are only consulted when the
	// matching PAYMENT_ENABLE_* row exists AND is "true" in system_settings.
	// Reason: in multi-tenant deployments a shared MOMO_SECRET_KEY env var
	// would otherwise let an attacker forge webhooks against any tenant who
	// hadn't yet configured MoMo through the admin UI. Forcing an explicit
	// opt-in row makes the env value a per-tenant default, not a free lunch.
	momoEnabledRow := values[keyEnableMoMo] != "" && parseBool(values[keyEnableMoMo])
	vietqrEnabledRow := values[keyEnableVietQR] != "" && parseBool(values[keyEnableVietQR])

	getDB := func(key string) string {
		if v, ok := values[key]; ok && v != "" {
			return v
		}
		return ""
	}
	getMoMo := func(key, envFallback string) string {
		if v := getDB(key); v != "" {
			return v
		}
		if momoEnabledRow && envFallback != "" {
			return os.Getenv(envFallback)
		}
		return ""
	}
	getVietQR := func(key, envFallback string) string {
		if v := getDB(key); v != "" {
			return v
		}
		if vietqrEnabledRow && envFallback != "" {
			return os.Getenv(envFallback)
		}
		return ""
	}

	pc := Payment{
		EnableMoMo:   momoEnabledRow,
		EnableVietQR: vietqrEnabledRow,
		MoMo: MoMo{
			PartnerCode: getMoMo(keyMoMoPartnerCode, "MOMO_PARTNER_CODE"),
			AccessKey:   getMoMo(keyMoMoAccessKey, "MOMO_ACCESS_KEY"),
			SecretKey:   getMoMo(keyMoMoSecretKey, "MOMO_SECRET_KEY"),
			Sandbox:     parseBool(getMoMo(keyMoMoSandbox, "MOMO_SANDBOX")),
		},
		VietQR: VietQR{
			BankCode:    strings.ToUpper(getVietQR(keyVietQRBankCode, "VIETQR_BANK_ID")),
			AccountNo:   getVietQR(keyVietQRAccountNo, "VIETQR_ACCOUNT_NO"),
			AccountName: getVietQR(keyVietQRAccountName, "VIETQR_ACCOUNT_NAME"),
		},
	}
	return pc, nil
}

// Upsert persists a single PAYMENT_* key for tenantID. Used by PUT /admin/settings/payments.
// Callers should wrap multiple key writes in a transaction; this helper only
// touches one row so it stays composable.
func Upsert(ctx context.Context, pool *pgxpool.Pool, tenantID int64, key, value string) error {
	if !isKnownKey(key) {
		return fmt.Errorf("payment/config: unknown key %q", key)
	}
	const q = `INSERT INTO public.system_settings (tenant_id, key, value)
		VALUES ($1, $2, $3)
		ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`
	if _, err := pool.Exec(ctx, q, tenantID, key, value); err != nil {
		return fmt.Errorf("payment/config: upsert %s: %w", key, err)
	}
	return nil
}

// LookupSecretKeyIsSet returns true when PAYMENT_MOMO_SECRET_KEY exists for
// the tenant (or the MOMO_SECRET_KEY env fallback is non-empty). Used by GET
// /admin/settings/payments to avoid leaking the secret while still telling
// the UI whether one is configured.
func LookupSecretKeyIsSet(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (bool, error) {
	cfg, err := Load(ctx, pool, tenantID)
	if err != nil {
		return false, err
	}
	// Use Load's gating logic so env fallback only counts when the tenant has
	// explicitly opted into MoMo via the system_settings sentinel.
	return cfg.MoMo.SecretKey != "", nil
}

// Keys returns the canonical PAYMENT_* key list (read-only). Exported so the
// admin handler can validate request bodies against a closed set.
func Keys() []string {
	return []string{
		keyEnableMoMo, keyEnableVietQR,
		keyMoMoPartnerCode, keyMoMoAccessKey, keyMoMoSecretKey, keyMoMoSandbox,
		keyVietQRBankCode, keyVietQRAccountNo, keyVietQRAccountName,
	}
}

func isKnownKey(k string) bool {
	for _, v := range Keys() {
		if v == k {
			return true
		}
	}
	return false
}

// parseBool accepts MoMo/Supabase canonical "true"/"false" strings; everything
// else (including empty string) is false. Mirrors the Zod boolean coercion
// in apps/web/app/admin/settings/payments/actions.ts.
func parseBool(v string) bool {
	return strings.EqualFold(strings.TrimSpace(v), "true")
}
