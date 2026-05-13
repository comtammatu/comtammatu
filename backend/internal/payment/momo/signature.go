package momo

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

// rawSignatureCreateInputs is the named-field shape that maps 1:1 to MoMo's
// 10-field alphabetical raw signature for the /create endpoint. Using a
// struct (rather than a map) makes the canonical ordering an enforced
// compile-time contract — adding a new field requires touching this struct
// and buildRawSignatureCreate in lockstep.
type rawSignatureCreateInputs struct {
	AccessKey   string
	Amount      int64
	ExtraData   string
	IPNURL      string
	OrderID     string
	OrderInfo   string
	PartnerCode string
	RedirectURL string
	RequestID   string
	RequestType string
}

// buildRawSignatureCreate concatenates the 10 fields MoMo requires for
// /create requests, alphabetically by key, with '&' separators.
//
// Reference: packages/shared/src/providers/impl/momo.ts:113-124.
func buildRawSignatureCreate(in rawSignatureCreateInputs) string {
	pairs := []string{
		"accessKey=" + in.AccessKey,
		fmt.Sprintf("amount=%d", in.Amount),
		"extraData=" + in.ExtraData,
		"ipnUrl=" + in.IPNURL,
		"orderId=" + in.OrderID,
		"orderInfo=" + in.OrderInfo,
		"partnerCode=" + in.PartnerCode,
		"redirectUrl=" + in.RedirectURL,
		"requestId=" + in.RequestID,
		"requestType=" + in.RequestType,
	}
	return strings.Join(pairs, "&")
}

// buildRawSignatureWebhook concatenates the 13 fields MoMo includes in IPN
// signature input, alphabetically by key, with '&' separators. Any missing
// field becomes the empty string (matches the `?? ""` defaults in the TS
// source so signatures stay verifiable even when MoMo omits optional fields).
//
// Reference: packages/shared/src/providers/impl/momo.ts:229-243.
func buildRawSignatureWebhook(accessKey string, payload map[string]any) string {
	// fmt.Sprint formats float64(1.7e12) as "1.7e+12" — that path would silently
	// corrupt every real MoMo signature because the JSON decoder hands us
	// numbers as float64 by default. Coerce numerics to a stable canonical
	// string instead (whole numbers → decimal integer, decimals → minimal
	// non-scientific form, json.Number → raw string).
	field := func(k string) string {
		v, ok := payload[k]
		if !ok || v == nil {
			return ""
		}
		switch t := v.(type) {
		case string:
			return t
		case float64:
			if t == float64(int64(t)) {
				return strconv.FormatInt(int64(t), 10)
			}
			return strconv.FormatFloat(t, 'f', -1, 64)
		case json.Number:
			return string(t)
		case int:
			return strconv.Itoa(t)
		case int64:
			return strconv.FormatInt(t, 10)
		case bool:
			return strconv.FormatBool(t)
		}
		return fmt.Sprint(v)
	}
	pairs := []string{
		"accessKey=" + accessKey,
		"amount=" + field("amount"),
		"extraData=" + field("extraData"),
		"message=" + field("message"),
		"orderId=" + field("orderId"),
		"orderInfo=" + field("orderInfo"),
		"orderType=" + field("orderType"),
		"partnerCode=" + field("partnerCode"),
		"payType=" + field("payType"),
		"requestId=" + field("requestId"),
		"responseTime=" + field("responseTime"),
		"resultCode=" + field("resultCode"),
		"transId=" + field("transId"),
	}
	return strings.Join(pairs, "&")
}
