package settings

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"

	"github.com/personal/comtammatu/backend/internal/httputil"
	"github.com/personal/comtammatu/backend/internal/middleware"
	paymentconfig "github.com/personal/comtammatu/backend/internal/payment/config"
)

// PaymentSettingsResponse is the shape returned by GET /admin/settings/payments.
// SecretKey is intentionally absent and replaced by SecretKeySet (bool) so the
// UI can show "configured ✓" without ever exposing the secret to the client.
type PaymentSettingsResponse struct {
	EnableMoMo   bool                    `json:"enable_momo"`
	EnableVietQR bool                    `json:"enable_vietqr"`
	MoMo         PaymentSettingsMoMoView `json:"momo"`
	VietQR       paymentconfig.VietQR    `json:"vietqr"`
}

// PaymentSettingsMoMoView projects MoMo config for the admin UI — explicit
// secret_key_set flag, no secret value.
type PaymentSettingsMoMoView struct {
	PartnerCode  string `json:"partner_code"`
	AccessKey    string `json:"access_key"`
	Sandbox      bool   `json:"sandbox"`
	SecretKeySet bool   `json:"secret_key_set"`
}

// PaymentSettingsRequest is the PUT body. Pointer fields are optional — nil
// means "no change" so the UI can submit a partial update (in particular,
// omitting momo_secret_key preserves the existing secret).
type PaymentSettingsRequest struct {
	EnableMoMo        *bool   `json:"enable_momo,omitempty"`
	EnableVietQR      *bool   `json:"enable_vietqr,omitempty"`
	MoMoPartnerCode   *string `json:"momo_partner_code,omitempty"`
	MoMoAccessKey     *string `json:"momo_access_key,omitempty"`
	MoMoSecretKey     *string `json:"momo_secret_key,omitempty"`
	MoMoSandbox       *bool   `json:"momo_sandbox,omitempty"`
	VietQRBankCode    *string `json:"vietqr_bank_code,omitempty"`
	VietQRAccountNo   *string `json:"vietqr_account_no,omitempty"`
	VietQRAccountName *string `json:"vietqr_account_name,omitempty"`
}

var (
	bankCodeRe    = regexp.MustCompile(`^[A-Za-z0-9]{1,32}$`)
	accountNoRe   = regexp.MustCompile(`^[A-Za-z0-9]{1,32}$`)
	accountNameRe = regexp.MustCompile(`^.{0,64}$`)
)

// paymentSettingsAllowedRoles gates GET/PUT /admin/settings/payments.
// Payment credentials (especially the MoMo secret_key) are tenant-wide secrets;
// branch_manager and below have no business reading or rotating them. Mirrors
// the old BE's SETTINGS_TENANT permission gate (apps/web/app/admin/settings/payments/actions.ts).
var paymentSettingsAllowedRoles = map[string]bool{
	"owner":         true,
	"super_manager": true,
}

func gatePaymentSettings(w http.ResponseWriter, role string) bool {
	if !paymentSettingsAllowedRoles[role] {
		httputil.WriteError(w, http.StatusForbidden, "payment settings require owner or super_manager role")
		return false
	}
	return true
}

// GetPayments handles GET /admin/settings/payments.
func (h *Handler) GetPayments(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if !gatePaymentSettings(w, string(claims.UserRole)) {
		return
	}
	cfg, err := paymentconfig.Load(r.Context(), h.pool, claims.TenantID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to load payment settings")
		return
	}
	secretSet, err := paymentconfig.LookupSecretKeyIsSet(r.Context(), h.pool, claims.TenantID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to load secret status")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, PaymentSettingsResponse{
		EnableMoMo:   cfg.EnableMoMo,
		EnableVietQR: cfg.EnableVietQR,
		MoMo: PaymentSettingsMoMoView{
			PartnerCode:  cfg.MoMo.PartnerCode,
			AccessKey:    cfg.MoMo.AccessKey,
			Sandbox:      cfg.MoMo.Sandbox,
			SecretKeySet: secretSet,
		},
		VietQR: cfg.VietQR,
	})
}

// PutPayments handles PUT /admin/settings/payments.
//
// Each known PAYMENT_* key is upserted independently. Empty MoMoSecretKey
// preserves the existing row (so the UI never has to round-trip the secret).
// Validation rejects invalid bank-code/account shapes with 422 before any
// write happens — partial-write failures still leave the prior state intact
// because every Upsert call is atomic on its own row.
func (h *Handler) PutPayments(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if !gatePaymentSettings(w, string(claims.UserRole)) {
		return
	}
	var req PaymentSettingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if msg := validatePaymentRequest(&req); msg != "" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, msg)
		return
	}

	type pair struct{ key, value string }
	var writes []pair
	if req.EnableMoMo != nil {
		writes = append(writes, pair{"PAYMENT_ENABLE_MOMO", boolString(*req.EnableMoMo)})
	}
	if req.EnableVietQR != nil {
		writes = append(writes, pair{"PAYMENT_ENABLE_VIETQR", boolString(*req.EnableVietQR)})
	}
	if req.MoMoPartnerCode != nil {
		writes = append(writes, pair{"PAYMENT_MOMO_PARTNER_CODE", *req.MoMoPartnerCode})
	}
	if req.MoMoAccessKey != nil {
		writes = append(writes, pair{"PAYMENT_MOMO_ACCESS_KEY", *req.MoMoAccessKey})
	}
	if req.MoMoSecretKey != nil && *req.MoMoSecretKey != "" {
		// Empty string is "no change" — the UI sends empty when the secret is
		// already set and the admin didn't re-type it. Only persist when a
		// new value is provided.
		writes = append(writes, pair{"PAYMENT_MOMO_SECRET_KEY", *req.MoMoSecretKey})
	}
	if req.MoMoSandbox != nil {
		writes = append(writes, pair{"PAYMENT_MOMO_SANDBOX", boolString(*req.MoMoSandbox)})
	}
	if req.VietQRBankCode != nil {
		writes = append(writes, pair{"PAYMENT_VIETQR_BANK_CODE", strings.ToUpper(*req.VietQRBankCode)})
	}
	if req.VietQRAccountNo != nil {
		writes = append(writes, pair{"PAYMENT_VIETQR_ACCOUNT_NO", *req.VietQRAccountNo})
	}
	if req.VietQRAccountName != nil {
		writes = append(writes, pair{"PAYMENT_VIETQR_ACCOUNT_NAME", *req.VietQRAccountName})
	}

	for _, p := range writes {
		if err := paymentconfig.Upsert(r.Context(), h.pool, claims.TenantID, p.key, p.value); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to save payment settings")
			return
		}
	}

	h.GetPayments(w, r)
}

func validatePaymentRequest(req *PaymentSettingsRequest) string {
	if req.VietQRBankCode != nil && !bankCodeRe.MatchString(*req.VietQRBankCode) {
		return "vietqr_bank_code must be alphanumeric, max 32 characters"
	}
	if req.VietQRAccountNo != nil && !accountNoRe.MatchString(*req.VietQRAccountNo) {
		return "vietqr_account_no must be alphanumeric, max 32 characters"
	}
	if req.VietQRAccountName != nil && !accountNameRe.MatchString(*req.VietQRAccountName) {
		return "vietqr_account_name must be at most 64 characters"
	}
	return ""
}

func boolString(b bool) string {
	if b {
		return "true"
	}
	return "false"
}
