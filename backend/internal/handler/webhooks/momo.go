// Package webhooks holds public, no-auth HTTP routes used by external payment
// providers (MoMo IPN today; VietQR webhook + VNPay can land here next).
package webhooks

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	paymentconfig "github.com/personal/comtammatu/backend/internal/payment/config"
	"github.com/personal/comtammatu/backend/internal/payment/momo"
)

// Handler serves payment-provider webhooks.
type Handler struct {
	pool *pgxpool.Pool
}

// New constructs a Handler.
func New(pool *pgxpool.Pool) *Handler { return &Handler{pool: pool} }

// MoMo handles POST /webhooks/momo. The route is public — MoMo's IPN service
// cannot authenticate to us, so the signature on the body is the only proof
// of authenticity. Every code path returns 204 No Content because MoMo
// treats anything else as a retryable failure and will resend the same
// event (we'd rather log + ignore than spin in a retry loop).
func (h *Handler) MoMo(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		slog.Warn("momo webhook: read body", "err", err)
		w.WriteHeader(http.StatusNoContent)
		return
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		slog.Warn("momo webhook: malformed JSON", "err", err, "len", len(body))
		w.WriteHeader(http.StatusNoContent)
		return
	}

	tenantID, requestID, signature, ok := h.extractIdentifiers(payload)
	if !ok {
		slog.Warn("momo webhook: missing required fields", "payload_keys", keys(payload))
		w.WriteHeader(http.StatusNoContent)
		return
	}

	cfg, err := paymentconfig.Load(r.Context(), h.pool, tenantID)
	if err != nil {
		slog.Error("momo webhook: load tenant config", "tenant_id", tenantID, "err", err)
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if cfg.MoMo.SecretKey == "" || cfg.MoMo.AccessKey == "" {
		slog.Warn("momo webhook: tenant has no MoMo credentials", "tenant_id", tenantID)
		w.WriteHeader(http.StatusNoContent)
		return
	}

	provider := momo.New(momo.Config{
		PartnerCode: cfg.MoMo.PartnerCode,
		AccessKey:   cfg.MoMo.AccessKey,
		SecretKey:   cfg.MoMo.SecretKey,
		Sandbox:     cfg.MoMo.Sandbox,
	})
	verification := provider.VerifyWebhook(payload, signature)

	// Always insert the event row first — this is the idempotency anchor.
	// signature_valid=false rows stay for forensic review without ever
	// triggering complete_payment_and_consume_stock.
	claimed, err := h.claimEvent(r.Context(), tenantID, requestID, verification.Valid, body)
	if err != nil {
		slog.Error("momo webhook: claim event", "tenant_id", tenantID, "request_id", requestID, "err", err)
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if !claimed.fresh {
		// Replay: a previous run already finalised this event. MoMo retries
		// until 2xx so the 204 stops the retry loop.
		slog.Info("momo webhook: replay ignored", "tenant_id", tenantID, "request_id", requestID, "prior_status", claimed.priorStatus)
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if !verification.Valid {
		_ = h.markEvent(r.Context(), tenantID, requestID, "ignored", "invalid_signature")
		slog.Warn("momo webhook: invalid signature", "tenant_id", tenantID, "request_id", requestID)
		w.WriteHeader(http.StatusNoContent)
		return
	}

	resultCode := intField(payload, "resultCode")
	processingStatus, errorCode := h.processVerifiedEvent(r.Context(), processingInputs{
		tenantID:    tenantID,
		orderID:     verification.OrderID,
		providerRef: providerRefField(payload),
		resultCode:  resultCode,
		amount:      verification.Amount,
		payload:     body,
	})
	if err := h.markEvent(r.Context(), tenantID, requestID, processingStatus, errorCode); err != nil {
		slog.Error("momo webhook: mark event", "request_id", requestID, "err", err)
	}
	w.WriteHeader(http.StatusNoContent)
}

// extractIdentifiers reads the three fields the webhook flow needs out of the
// raw payload before signature verification: tenant id (from extraData),
// request id (idempotency key), and signature (proof of authenticity).
func (h *Handler) extractIdentifiers(payload map[string]any) (tenantID int64, requestID string, signature string, ok bool) {
	sig, _ := payload["signature"].(string)
	reqID, _ := payload["requestId"].(string)
	if sig == "" || reqID == "" {
		return 0, "", "", false
	}
	tid, ok := tenantFromExtraData(payload)
	if !ok {
		return 0, "", "", false
	}
	return tid, reqID, sig, true
}

type processingInputs struct {
	tenantID    int64
	orderID     int64
	providerRef string
	resultCode  int64
	amount      int64
	payload     []byte
}

// processVerifiedEvent runs after signature passed + event row is claimed.
// Returns the final processing_status (and an error_code on failures) so
// markEvent can record the outcome atomically.
func (h *Handler) processVerifiedEvent(ctx context.Context, in processingInputs) (string, string) {
	const findPaymentQ = `SELECT id FROM public.payments
		WHERE tenant_id = $1 AND order_id = $2 AND provider_ref = $3 AND method = 'momo'
		LIMIT 1`
	var paymentID int64
	err := h.pool.QueryRow(ctx, findPaymentQ, in.tenantID, in.orderID, in.providerRef).Scan(&paymentID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "ignored", "payment_not_found"
		}
		slog.Error("momo webhook: lookup payment", "err", err)
		return "failed", "payment_lookup_error"
	}

	// resultCode 0 = success; 9000 = authorized but not yet captured (still
	// counts as paid for capture-wallet flow). Anything else is a hard fail.
	if in.resultCode != 0 && in.resultCode != 9000 {
		const failQ = `UPDATE public.payments
			SET status = 'failed', provider_data = $1::jsonb, updated_at = now()
			WHERE id = $2 AND status = 'pending'`
		if _, err := h.pool.Exec(ctx, failQ, string(in.payload), paymentID); err != nil {
			slog.Error("momo webhook: mark payment failed", "err", err)
			return "failed", "payment_fail_update_error"
		}
		return "processed", ""
	}

	// Decimal string from int64 minor units (MoMo amount is whole VND already).
	expected := formatVND(in.amount)
	const completeQ = `SELECT status FROM public.complete_payment_and_consume_stock($1, $2::NUMERIC(15,2), $3::JSONB, NULL::UUID)`
	var rpcStatus string
	if err := h.pool.QueryRow(ctx, completeQ, paymentID, expected, string(in.payload)).Scan(&rpcStatus); err != nil {
		slog.Error("momo webhook: complete_payment_and_consume_stock", "err", err, "payment_id", paymentID)
		return "failed", "complete_rpc_error"
	}
	switch rpcStatus {
	case "completed", "already_completed":
		return "processed", ""
	case "amount_mismatch":
		return "failed", "amount_mismatch"
	case "not_found":
		return "failed", "payment_not_found_in_rpc"
	default:
		return "failed", rpcStatus
	}
}

// claimedEvent describes what claimEvent returns: fresh=true means we won the
// race to insert; fresh=false + priorStatus means another worker already
// finalised this event.
type claimedEvent struct {
	fresh       bool
	priorStatus string
}

// claimEvent inserts the webhook event row. Returns fresh=true on first insert,
// fresh=false on UNIQUE-conflict (replay). priorStatus is "" for non-final
// replays (i.e. the previous run crashed before markEvent) so the handler
// can decide whether to retry processing — for MoMo we always 204 either way,
// so this is purely diagnostic.
func (h *Handler) claimEvent(ctx context.Context, tenantID int64, requestID string, signatureValid bool, payload []byte) (claimedEvent, error) {
	const ins = `INSERT INTO public.webhook_events
		(tenant_id, provider, request_id, signature_valid, payload, processing_status)
		VALUES ($1, 'momo', $2, $3, $4::jsonb, 'received')
		ON CONFLICT (provider, request_id) DO NOTHING
		RETURNING id`
	var id int64
	err := h.pool.QueryRow(ctx, ins, tenantID, requestID, signatureValid, string(payload)).Scan(&id)
	if err == nil {
		return claimedEvent{fresh: true}, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return claimedEvent{}, err
	}
	// Conflict — read existing row to surface prior outcome.
	var prior string
	if qErr := h.pool.QueryRow(ctx,
		`SELECT processing_status FROM public.webhook_events WHERE provider = 'momo' AND request_id = $1`,
		requestID,
	).Scan(&prior); qErr != nil {
		return claimedEvent{fresh: false}, nil
	}
	return claimedEvent{fresh: false, priorStatus: prior}, nil
}

func (h *Handler) markEvent(ctx context.Context, tenantID int64, requestID, status, errorCode string) error {
	const q = `UPDATE public.webhook_events
		SET processing_status = $1, error_code = NULLIF($2, ''), processed_at = now()
		WHERE provider = 'momo' AND request_id = $3 AND tenant_id = $4`
	_, err := h.pool.Exec(ctx, q, status, errorCode, requestID, tenantID)
	return err
}

func tenantFromExtraData(p map[string]any) (int64, bool) {
	raw, ok := p["extraData"].(string)
	if !ok || raw == "" {
		return 0, false
	}
	decoded, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return 0, false
	}
	var parsed struct {
		TenantID int64 `json:"tenantId"`
	}
	if err := json.Unmarshal(decoded, &parsed); err != nil || parsed.TenantID == 0 {
		return 0, false
	}
	return parsed.TenantID, true
}

func intField(p map[string]any, k string) int64 {
	switch v := p[k].(type) {
	case float64:
		return int64(v)
	case int:
		return int64(v)
	case int64:
		return v
	case json.Number:
		if n, err := v.Int64(); err == nil {
			return n
		}
	}
	return 0
}

func providerRefField(p map[string]any) string {
	s, _ := p["orderId"].(string)
	return s
}

func keys(m map[string]any) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

// formatVND renders an integer amount as a NUMERIC(15,2)-compatible string.
// MoMo amounts are whole VND so we emit ".00" to match the column scale and
// avoid implicit rounding inside the RPC's exact-match guard.
func formatVND(amount int64) string {
	return strconvI64(amount) + ".00"
}

func strconvI64(v int64) string {
	// Tiny inline conversion avoids pulling strconv into a hot webhook path's
	// import graph just to format one number.
	if v == 0 {
		return "0"
	}
	neg := v < 0
	if neg {
		v = -v
	}
	var buf [20]byte
	pos := len(buf)
	for v > 0 {
		pos--
		buf[pos] = byte('0' + v%10)
		v /= 10
	}
	if neg {
		pos--
		buf[pos] = '-'
	}
	return string(buf[pos:])
}
