package momo

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"strings"
	"testing"
)

// Known-vector HMAC: same algorithm Node's createHmac("sha256", secret).update(data).digest("hex")
// produces. The test pins the algorithm choice — if anyone ever changes the
// hash or the encoding the signature on the wire will silently drift away
// from MoMo's expected value.
func TestSign_KnownVector(t *testing.T) {
	p := New(Config{SecretKey: "secret"})
	got := p.Sign("the quick brown fox jumps over the lazy dog")
	// Pre-computed via: printf '%s' "the quick brown fox jumps over the lazy dog" | openssl dgst -sha256 -hmac secret -hex
	const want = "792d13d1af1c4f4760fd77ea658bcdbd53f0f30db2c978d578352173e05045b0"
	if got != want {
		t.Fatalf("Sign mismatch:\n  got:  %s\n  want: %s", got, want)
	}
}

func TestBuildRawSignatureCreate_FieldOrder(t *testing.T) {
	got := buildRawSignatureCreate(rawSignatureCreateInputs{
		AccessKey:   "AK",
		Amount:      50000,
		ExtraData:   "EXTRA",
		IPNURL:      "https://example.com/ipn",
		OrderID:     "MOMO-1-aabbccdd",
		OrderInfo:   "OI",
		PartnerCode: "PC",
		RedirectURL: "https://example.com/return",
		RequestID:   "RQ",
		RequestType: "captureWallet",
	})
	want := "accessKey=AK&amount=50000&extraData=EXTRA&ipnUrl=https://example.com/ipn&orderId=MOMO-1-aabbccdd&orderInfo=OI&partnerCode=PC&redirectUrl=https://example.com/return&requestId=RQ&requestType=captureWallet"
	if got != want {
		t.Fatalf("create raw mismatch:\n  got:  %s\n  want: %s", got, want)
	}
}

func TestBuildRawSignatureWebhook_MissingFieldsBecomeEmpty(t *testing.T) {
	payload := map[string]any{
		"amount":       50000,
		"orderId":      "MOMO-7-abcdef01",
		"transId":      99887766,
		"resultCode":   0,
		"responseTime": int64(1700000000000),
	}
	got := buildRawSignatureWebhook("AK", payload)
	// Omitted fields (extraData, message, orderInfo, orderType, partnerCode,
	// payType, requestId) collapse to the empty string — MoMo guarantees this
	// ordering even when fields are missing.
	want := "accessKey=AK&amount=50000&extraData=&message=&orderId=MOMO-7-abcdef01&orderInfo=&orderType=&partnerCode=&payType=&requestId=&responseTime=1700000000000&resultCode=0&transId=99887766"
	if got != want {
		t.Fatalf("webhook raw mismatch:\n  got:  %s\n  want: %s", got, want)
	}
}

// Regression guard for the float64 → "1.7e+12" trap. json.Unmarshal into
// map[string]any decodes JSON numbers as float64; fmt.Sprint then emits
// scientific notation for large whole numbers, breaking signature match
// against MoMo's own integer-formatted input. Caught by review of 8d754e3c.
func TestBuildRawSignatureWebhook_LargeIntegerFromJSON(t *testing.T) {
	rawJSON := []byte(`{
		"amount": 50000, "extraData": "", "message": "OK",
		"orderId": "MOMO-1-x", "orderInfo": "", "orderType": "momo_wallet",
		"partnerCode": "PC", "payType": "qr", "requestId": "RQ",
		"responseTime": 1700000000000, "resultCode": 0, "transId": 99887766
	}`)
	var payload map[string]any
	if err := json.Unmarshal(rawJSON, &payload); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	got := buildRawSignatureWebhook("AK", payload)
	if strings.Contains(got, "e+") || strings.Contains(got, "E+") {
		t.Fatalf("raw signature must not contain scientific notation: %s", got)
	}
	if !strings.Contains(got, "responseTime=1700000000000") {
		t.Fatalf("expected responseTime to be decimal-formatted, got: %s", got)
	}
	if !strings.Contains(got, "transId=99887766") {
		t.Fatalf("expected transId to be decimal-formatted, got: %s", got)
	}
}

func TestVerifyWebhook_ValidSignatureExtractsOrderID(t *testing.T) {
	p := New(Config{AccessKey: "AK", SecretKey: "secret"})

	extra, _ := json.Marshal(map[string]any{"tenantId": 1, "orderId": 42})
	payload := map[string]any{
		"amount":       50000,
		"extraData":    base64.StdEncoding.EncodeToString(extra),
		"message":      "Successful",
		"orderId":      "MOMO-42-deadbeef",
		"orderInfo":    "Thanh toan don hang #42",
		"orderType":    "momo_wallet",
		"partnerCode":  "PC",
		"payType":      "qr",
		"requestId":    "RQ",
		"responseTime": int64(1700000000000),
		"resultCode":   0,
		"transId":      99887766,
	}
	raw := buildRawSignatureWebhook("AK", payload)
	sig := computeReferenceHMAC(t, "secret", raw)

	res := p.VerifyWebhook(payload, sig)
	if !res.Valid {
		t.Fatalf("expected Valid=true, got %+v", res)
	}
	if res.OrderID != 42 {
		t.Errorf("OrderID: got %d, want 42 (decoded from extraData)", res.OrderID)
	}
	if res.Amount != 50000 {
		t.Errorf("Amount: got %d, want 50000", res.Amount)
	}
	if res.ProviderRef != "99887766" {
		t.Errorf("ProviderRef: got %q, want \"99887766\" (transId)", res.ProviderRef)
	}
}

func TestVerifyWebhook_TamperedSignatureRejected(t *testing.T) {
	p := New(Config{AccessKey: "AK", SecretKey: "secret"})
	payload := map[string]any{"amount": 50000, "transId": 1}
	tampered := strings.Repeat("0", 64) // valid hex shape, wrong value
	if got := p.VerifyWebhook(payload, tampered); got.Valid {
		t.Fatalf("expected Valid=false for tampered sig, got %+v", got)
	}
}

func TestVerifyWebhook_EmptySignatureRejected(t *testing.T) {
	p := New(Config{AccessKey: "AK", SecretKey: "secret"})
	if got := p.VerifyWebhook(map[string]any{"a": 1}, ""); got.Valid {
		t.Fatalf("expected Valid=false on empty signature, got %+v", got)
	}
}

func TestVerifyWebhook_NonHexSignatureRejected(t *testing.T) {
	p := New(Config{AccessKey: "AK", SecretKey: "secret"})
	// "not-a-hex" decodes to an error → must not panic and must reject.
	if got := p.VerifyWebhook(map[string]any{"a": 1}, "not-a-hex-string"); got.Valid {
		t.Fatalf("expected Valid=false on non-hex sig, got %+v", got)
	}
}

func TestVerifyWebhook_MissingCredentialsRejected(t *testing.T) {
	p := New(Config{})
	if got := p.VerifyWebhook(map[string]any{"a": 1}, strings.Repeat("a", 64)); got.Valid {
		t.Fatalf("expected Valid=false when credentials missing, got %+v", got)
	}
}

func TestAPIURL_SandboxToggle(t *testing.T) {
	if got := New(Config{Sandbox: true}).apiURL(); got != sandboxURL {
		t.Errorf("Sandbox=true: got %q, want %q", got, sandboxURL)
	}
	if got := New(Config{Sandbox: false}).apiURL(); got != productionURL {
		t.Errorf("Sandbox=false: got %q, want %q", got, productionURL)
	}
}

// computeReferenceHMAC reproduces createHmac("sha256", secret).update(raw).digest("hex")
// independently of provider.sign so tests can construct the expected signature
// without trusting the code under test.
func computeReferenceHMAC(t *testing.T, secret, raw string) string {
	t.Helper()
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(raw))
	return hex.EncodeToString(mac.Sum(nil))
}
