// Package momo is a Go port of packages/shared/src/providers/impl/momo.ts.
// It signs MoMo Payment Gateway v2 requests, verifies IPN webhook signatures,
// and calls the MoMo /create endpoint. Pure stdlib — no third-party deps.
package momo

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"time"
)

const (
	sandboxURL    = "https://test-payment.momo.vn/v2/gateway/api/create"
	productionURL = "https://payment.momo.vn/v2/gateway/api/create"

	// MoMo's own production timeout is ~25s; we add headroom but cap to avoid
	// pinning a request goroutine forever on a stuck merchant network.
	apiTimeout = 30 * time.Second
)

// Config holds per-tenant MoMo credentials.
type Config struct {
	PartnerCode string
	AccessKey   string
	SecretKey   string
	Sandbox     bool
}

// Provider drives the MoMo Payment Gateway v2 API for a single tenant.
type Provider struct {
	cfg    Config
	client *http.Client
}

// New returns a Provider with a private 30-second HTTP client.
func New(cfg Config) *Provider {
	return &Provider{
		cfg:    cfg,
		client: &http.Client{Timeout: apiTimeout},
	}
}

// CreateRequest is the input to CreatePayment. tenantID/orderID are echoed back
// in extraData so the IPN webhook can locate the local payment row.
type CreateRequest struct {
	TenantID    int64
	OrderID     int64
	OrderNumber string
	// Amount is VND, integer (Math.round in the TS source).
	Amount      int64
	Description string
	// IPNURL must be a publicly reachable HTTPS URL in production (MoMo cannot
	// call a private/localhost host). The caller is responsible for building
	// this from the app's public base URL.
	IPNURL string
	// RedirectURL is where MoMo redirects the customer after payment. Optional;
	// some merchant flows use deeplink-only and skip the browser return page.
	RedirectURL string
}

// CreateResult is the typed shape returned by CreatePayment.
type CreateResult struct {
	Status       Status         `json:"status"`
	ProviderRef  string         `json:"provider_ref"`
	QRData       string         `json:"qr_data,omitempty"`
	ProviderData map[string]any `json:"provider_data"`
	momoResponse map[string]json.RawMessage
}

// Status is the local-state enum returned by CreatePayment.
type Status string

const (
	StatusPending   Status = "pending"
	StatusCompleted Status = "completed"
	StatusFailed    Status = "failed"
)

// WebhookVerification is the parsed result of a verifyWebhook call.
type WebhookVerification struct {
	Valid       bool
	OrderID     int64  // parsed from extraData JSON
	Amount      int64  // VND
	ProviderRef string // transId
}

// sign computes the lower-case hex HMAC-SHA256 of rawData under secretKey,
// matching createHmac("sha256", secretKey).update(rawData).digest("hex").
func (p *Provider) sign(rawData string) string {
	mac := hmac.New(sha256.New, []byte(p.cfg.SecretKey))
	mac.Write([]byte(rawData))
	return hex.EncodeToString(mac.Sum(nil))
}

// Sign exposes the raw HMAC-SHA256 hex digest. Exported for tests + integration
// scripts that need a deterministic signature against a known fixture.
func (p *Provider) Sign(rawData string) string {
	return p.sign(rawData)
}

func (p *Provider) apiURL() string {
	if p.cfg.Sandbox {
		return sandboxURL
	}
	return productionURL
}

// CreatePayment hits the MoMo /create endpoint and returns the local-state
// CreateResult. A failed POST or a non-zero resultCode resolves to
// StatusFailed with the MoMo message embedded in providerData — no error.
// Errors are only returned for caller mistakes (missing credentials,
// malformed URL, validation failures) so the handler layer can distinguish
// "merchant config broken" from "MoMo declined this payment".
func (p *Provider) CreatePayment(ctx context.Context, req CreateRequest) (CreateResult, error) {
	if p.cfg.PartnerCode == "" || p.cfg.AccessKey == "" || p.cfg.SecretKey == "" {
		return CreateResult{}, errors.New("momo: missing credentials")
	}
	if req.IPNURL == "" {
		return CreateResult{}, errors.New("momo: ipnUrl is required for IPN auto-confirm")
	}
	if _, err := url.ParseRequestURI(req.IPNURL); err != nil {
		return CreateResult{}, fmt.Errorf("momo: invalid ipnUrl: %w", err)
	}

	requestID := fmt.Sprintf("%s-%d", p.cfg.PartnerCode, time.Now().UnixMilli())
	// orderId must be globally unique per partner; combine the local order
	// id with a UUID-shaped suffix so retries don't collide.
	orderID := fmt.Sprintf("MOMO-%d-%s", req.OrderID, shortUUID())
	orderInfo := req.Description
	if orderInfo == "" {
		orderInfo = fmt.Sprintf("Thanh toan don hang %s", req.OrderNumber)
	}

	extraDataPayload, err := json.Marshal(map[string]any{
		"tenantId": req.TenantID,
		"orderId":  req.OrderID,
	})
	if err != nil {
		return CreateResult{}, fmt.Errorf("momo: encode extraData: %w", err)
	}
	extraData := base64.StdEncoding.EncodeToString(extraDataPayload)

	const requestType = "captureWallet"

	rawSignature := buildRawSignatureCreate(rawSignatureCreateInputs{
		AccessKey:   p.cfg.AccessKey,
		Amount:      req.Amount,
		ExtraData:   extraData,
		IPNURL:      req.IPNURL,
		OrderID:     orderID,
		OrderInfo:   orderInfo,
		PartnerCode: p.cfg.PartnerCode,
		RedirectURL: req.RedirectURL,
		RequestID:   requestID,
		RequestType: requestType,
	})
	signature := p.sign(rawSignature)

	body := map[string]any{
		"partnerCode": p.cfg.PartnerCode,
		"requestId":   requestID,
		"amount":      req.Amount,
		"orderId":     orderID,
		"orderInfo":   orderInfo,
		"redirectUrl": req.RedirectURL,
		"ipnUrl":      req.IPNURL,
		"extraData":   extraData,
		"requestType": requestType,
		"autoCapture": true,
		"signature":   signature,
		"lang":        "vi",
	}
	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return CreateResult{}, fmt.Errorf("momo: encode body: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, p.apiURL(), bytes.NewReader(bodyBytes))
	if err != nil {
		return CreateResult{}, fmt.Errorf("momo: new request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := p.client.Do(httpReq)
	if err != nil {
		// Network / timeout / DNS — graceful "failed" with diagnostic data.
		return CreateResult{
			Status:      StatusFailed,
			ProviderRef: orderID,
			ProviderData: map[string]any{
				"error": err.Error(),
			},
		}, nil
	}
	defer resp.Body.Close()

	var data struct {
		ResultCode      int    `json:"resultCode"`
		Message         string `json:"message"`
		PayURL          string `json:"payUrl"`
		Deeplink        string `json:"deeplink"`
		DeeplinkMiniApp string `json:"deeplinkMiniApp"`
		QRCodeURL       string `json:"qrCodeUrl"`
		OrderID         string `json:"orderId"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return CreateResult{
			Status:      StatusFailed,
			ProviderRef: orderID,
			ProviderData: map[string]any{
				"error": fmt.Sprintf("decode response: %v", err),
			},
		}, nil
	}

	if data.ResultCode != 0 {
		return CreateResult{
			Status:      StatusFailed,
			ProviderRef: orderID,
			ProviderData: map[string]any{
				"resultCode": data.ResultCode,
				"message":    data.Message,
			},
		}, nil
	}

	// MoMo production merchants must request permission for qrCodeUrl. Without
	// it the response only has payUrl/deeplink which are NOT suitable for a
	// POS-presented QR; surface this clearly so ops know to fix the merchant.
	if data.QRCodeURL == "" {
		return CreateResult{
			Status:      StatusFailed,
			ProviderRef: orderID,
			ProviderData: map[string]any{
				"resultCode":        data.ResultCode,
				"message":           "MoMo không trả về qrCodeUrl. Cần bật quyền qrCodeUrl/Dynamic QR cho merchant MoMo.",
				"payUrlReturned":    data.PayURL != "",
				"deeplinkReturned":  data.Deeplink != "",
				"qrCodeUrlReturned": false,
			},
		}, nil
	}

	return CreateResult{
		Status:      StatusPending,
		ProviderRef: orderID,
		QRData:      data.QRCodeURL,
		ProviderData: map[string]any{
			"momoOrderId":     data.OrderID,
			"requestId":       requestID,
			"qrSource":        "qrCodeUrl",
			"qrCodeUrl":       data.QRCodeURL,
			"payUrl":          data.PayURL,
			"deeplink":        data.Deeplink,
			"deeplinkMiniApp": data.DeeplinkMiniApp,
			"redirectUrl":     req.RedirectURL,
		},
	}, nil
}

// VerifyWebhook validates a MoMo IPN POST. It rebuilds the 13-field
// alphabetical raw signature, compares HMAC-SHA256 hex digests in
// constant time, and (on success) decodes extraData → orderId.
func (p *Provider) VerifyWebhook(payload map[string]any, signature string) WebhookVerification {
	if signature == "" || len(payload) == 0 {
		return WebhookVerification{}
	}
	if p.cfg.SecretKey == "" || p.cfg.AccessKey == "" {
		return WebhookVerification{}
	}

	raw := buildRawSignatureWebhook(p.cfg.AccessKey, payload)
	expected := p.sign(raw)

	got, err := hex.DecodeString(signature)
	if err != nil {
		return WebhookVerification{}
	}
	want, err := hex.DecodeString(expected)
	if err != nil {
		return WebhookVerification{}
	}
	if subtle.ConstantTimeCompare(got, want) != 1 {
		return WebhookVerification{}
	}

	v := WebhookVerification{Valid: true}
	if rawAmount, ok := payload["amount"]; ok {
		v.Amount = toInt64(rawAmount)
	}
	if rawTrans, ok := payload["transId"]; ok {
		v.ProviderRef = fmt.Sprint(rawTrans)
	}
	// MoMo's payload.orderId is the merchant-side string ("MOMO-{localId}-..."),
	// not the local DB id. We re-derive the local order id from extraData.
	if rawExtra, ok := payload["extraData"]; ok {
		if s, isStr := rawExtra.(string); isStr && s != "" {
			if decoded, derr := base64.StdEncoding.DecodeString(s); derr == nil {
				var parsed struct {
					OrderID int64 `json:"orderId"`
				}
				if jerr := json.Unmarshal(decoded, &parsed); jerr == nil {
					v.OrderID = parsed.OrderID
				}
			}
		}
	}
	return v
}

// shortUUID returns 8 lowercase-hex characters for orderId disambiguation.
// crypto/rand is overkill for collision avoidance at this scale; the partner
// code + millisecond timestamp already makes the orderId hard to guess.
func shortUUID() string {
	return fmt.Sprintf("%08x", time.Now().UnixNano()&0xffffffff)
}

func toInt64(v any) int64 {
	switch t := v.(type) {
	case float64:
		return int64(t)
	case int64:
		return t
	case int:
		return int64(t)
	case json.Number:
		if n, err := t.Int64(); err == nil {
			return n
		}
	case string:
		var n int64
		_, _ = fmt.Sscanf(t, "%d", &n)
		return n
	}
	return 0
}
