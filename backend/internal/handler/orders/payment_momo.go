package orders

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strconv"

	"github.com/jackc/pgx/v5"

	"github.com/personal/comtammatu/backend/internal/httputil"
	"github.com/personal/comtammatu/backend/internal/middleware"
	paymentconfig "github.com/personal/comtammatu/backend/internal/payment/config"
	"github.com/personal/comtammatu/backend/internal/payment/momo"
)

// confirmMoMoPayment is the method=momo branch of confirmPayment. It:
//  1. Loads tenant MoMo credentials from system_settings.
//  2. Calls MoMo's /create endpoint to get a qrCodeUrl + providerRef.
//  3. Inserts a 'pending' payment row via create_payment RPC.
//  4. Persists provider_data (raw MoMo response) onto that payment row.
//  5. Returns the redirect/QR info so the POS can render the customer-facing QR.
//
// The MoMo IPN webhook later confirms the payment in /webhooks/momo.
func (h *Handler) confirmMoMoPayment(w http.ResponseWriter, r *http.Request, branchID, orderID int64, req PaymentRequest) {
	claims := middleware.ClaimsFrom(r.Context())

	cfg, err := paymentconfig.Load(r.Context(), h.pool, claims.TenantID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to load payment config")
		return
	}
	if !cfg.EnableMoMo {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "momo is not enabled for this tenant")
		return
	}
	if cfg.MoMo.PartnerCode == "" || cfg.MoMo.AccessKey == "" || cfg.MoMo.SecretKey == "" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "momo credentials are not configured")
		return
	}

	// Look up the order number so MoMo's user-facing orderInfo matches the
	// cashier's receipt. Existence + tenant scoping is also a defence-in-depth
	// check on top of the URL param.
	var orderNumber string
	err = h.pool.QueryRow(r.Context(),
		`SELECT order_number FROM public.orders WHERE id = $1 AND tenant_id = $2 AND branch_id = $3`,
		orderID, claims.TenantID, branchID,
	).Scan(&orderNumber)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.WriteError(w, http.StatusNotFound, "order not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to look up order")
		return
	}

	amountInt, err := strconv.ParseInt(stripDecimal(req.Amount), 10, 64)
	if err != nil || amountInt <= 0 {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "amount must be a positive integer (VND)")
		return
	}

	baseURL := os.Getenv("NEXT_PUBLIC_APP_URL")
	if baseURL == "" {
		httputil.WriteError(w, http.StatusInternalServerError, "NEXT_PUBLIC_APP_URL is required for MoMo IPN")
		return
	}
	ipnURL := baseURL + "/webhooks/momo"
	redirectURL := os.Getenv("MOMO_REDIRECT_URL")
	if redirectURL == "" {
		redirectURL = baseURL + "/payment/momo/return"
	}

	provider := momo.New(momo.Config{
		PartnerCode: cfg.MoMo.PartnerCode,
		AccessKey:   cfg.MoMo.AccessKey,
		SecretKey:   cfg.MoMo.SecretKey,
		Sandbox:     cfg.MoMo.Sandbox,
	})
	result, err := provider.CreatePayment(r.Context(), momo.CreateRequest{
		TenantID:    claims.TenantID,
		OrderID:     orderID,
		OrderNumber: orderNumber,
		Amount:      amountInt,
		IPNURL:      ipnURL,
		RedirectURL: redirectURL,
	})
	if err != nil {
		httputil.WriteError(w, http.StatusBadGateway, fmt.Sprintf("momo provider error: %v", err))
		return
	}
	if result.Status == momo.StatusFailed {
		// Provider-level decline (resultCode != 0 or missing qrCodeUrl). The
		// providerData explains why; surface it as a 422 so the POS can show
		// a recoverable error message instead of treating it as 5xx.
		httputil.WriteJSON(w, http.StatusUnprocessableEntity, map[string]any{
			"error":         "momo refused to create payment",
			"provider_data": result.ProviderData,
		})
		return
	}

	// create_payment 8-arg form (provider_ref + initial status). The order
	// transitions to payment_status='pending' (not 'paid') so the cashier
	// keeps the order on the active list until MoMo's IPN confirms.
	const insertQ = `SELECT public.create_payment($1, $2, $3, $4, $5::NUMERIC(15,2), $6::UUID, $7, $8)`
	var rpcResult []byte
	if err := h.pool.QueryRow(r.Context(), insertQ,
		claims.TenantID, branchID, orderID, "momo", req.Amount, claims.UserUUID,
		result.ProviderRef, string(result.Status),
	).Scan(&rpcResult); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to record momo payment")
		return
	}

	// Pull payment_id out of the RPC result so we can persist provider_data.
	var rpc struct {
		PaymentID int64 `json:"payment_id"`
	}
	_ = json.Unmarshal(rpcResult, &rpc)
	if rpc.PaymentID > 0 {
		providerDataJSON, _ := json.Marshal(result.ProviderData)
		_, _ = h.pool.Exec(r.Context(),
			`UPDATE public.payments SET provider_data = $1::jsonb WHERE id = $2 AND status = 'pending'`,
			string(providerDataJSON), rpc.PaymentID,
		)
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"payment_id":   rpc.PaymentID,
		"status":       string(result.Status),
		"provider_ref": result.ProviderRef,
		"qr_data":      result.QRData,
		"qr_info":      result.ProviderData,
	})
}

// stripDecimal accepts "50000" or "50000.00" or "50000.0" and returns "50000".
// MoMo's API rejects non-integer VND amounts, so we round to whole VND before
// signing. The DB column stays NUMERIC(15,2) so the local payment row keeps
// the original precision; only the outbound MoMo call is integer-only.
func stripDecimal(amount string) string {
	for i, c := range amount {
		if c == '.' {
			return amount[:i]
		}
	}
	return amount
}
