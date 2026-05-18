package finance

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/personal/comtammatu/backend/internal/httputil"
)

// ─── GET /finance/posting-rules ──────────────────────────────────────────────

func (h *Handler) listPostingRules(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	const q = `
		SELECT id, rule_code, description, transaction_type,
		       debit_account_code, credit_account_code, is_active
		FROM public.posting_rules
		WHERE tenant_id = $1
		ORDER BY transaction_type, rule_code`

	rows, err := h.pool.Query(r.Context(), q, claims.TenantID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải quy tắc hạch toán.")
		return
	}
	defer rows.Close()

	type ruleRow struct {
		ID                int64   `json:"id"`
		RuleCode          string  `json:"rule_code"`
		Description       *string `json:"description"`
		TransactionType   string  `json:"transaction_type"`
		DebitAccountCode  *string `json:"debit_account_code"`
		CreditAccountCode *string `json:"credit_account_code"`
		IsActive          bool    `json:"is_active"`
	}

	out := make([]ruleRow, 0)
	for rows.Next() {
		var rule ruleRow
		if err := rows.Scan(
			&rule.ID, &rule.RuleCode, &rule.Description, &rule.TransactionType,
			&rule.DebitAccountCode, &rule.CreditAccountCode, &rule.IsActive,
		); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read posting rule")
			return
		}
		out = append(out, rule)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": out})
}

// ─── PUT /finance/posting-rules/{id} ─────────────────────────────────────────

type updatePostingRuleBody struct {
	DebitAccountCode  *string `json:"debit_account_code"`
	CreditAccountCode *string `json:"credit_account_code"`
	IsActive          *bool   `json:"is_active"`
}

func (h *Handler) updatePostingRule(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	ruleID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var body updatePostingRuleBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.DebitAccountCode == nil && body.CreditAccountCode == nil && body.IsActive == nil {
		httputil.WriteError(w, http.StatusBadRequest, "Không có thay đổi.")
		return
	}

	// Validate account codes exist for this tenant before persisting.
	codesToValidate := make([]string, 0, 2)
	if body.DebitAccountCode != nil && *body.DebitAccountCode != "" {
		codesToValidate = append(codesToValidate, *body.DebitAccountCode)
	}
	if body.CreditAccountCode != nil && *body.CreditAccountCode != "" {
		codesToValidate = append(codesToValidate, *body.CreditAccountCode)
	}
	if len(codesToValidate) > 0 {
		rows, err := h.pool.Query(r.Context(),
			`SELECT account_code FROM public.chart_of_accounts
			 WHERE tenant_id = $1 AND is_active = true AND account_code = ANY($2)`,
			claims.TenantID, codesToValidate,
		)
		if err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "Không thể xác minh mã tài khoản.")
			return
		}
		valid := make(map[string]bool)
		for rows.Next() {
			var code string
			if err := rows.Scan(&code); err != nil {
				rows.Close()
				httputil.WriteError(w, http.StatusInternalServerError, "failed to read account code")
				return
			}
			valid[code] = true
		}
		rows.Close()
		for _, code := range codesToValidate {
			if !valid[code] {
				httputil.WriteError(w, http.StatusUnprocessableEntity,
					"Mã tài khoản \""+code+"\" không tồn tại hoặc đã bị vô hiệu.")
				return
			}
		}
	}

	// Build dynamic UPDATE.
	setClauses := []string{}
	args := []any{}
	argIdx := 1

	if body.DebitAccountCode != nil {
		setClauses = append(setClauses, "debit_account_code = $"+strconv.Itoa(argIdx))
		args = append(args, *body.DebitAccountCode)
		argIdx++
	}
	if body.CreditAccountCode != nil {
		setClauses = append(setClauses, "credit_account_code = $"+strconv.Itoa(argIdx))
		args = append(args, *body.CreditAccountCode)
		argIdx++
	}
	if body.IsActive != nil {
		setClauses = append(setClauses, "is_active = $"+strconv.Itoa(argIdx))
		args = append(args, *body.IsActive)
		argIdx++
	}

	args = append(args, ruleID, claims.TenantID)
	query := "UPDATE public.posting_rules SET " + strings.Join(setClauses, ", ") +
		" WHERE id = $" + strconv.Itoa(argIdx) + " AND tenant_id = $" + strconv.Itoa(argIdx+1) +
		" RETURNING id"

	var returnedID int64
	err := h.pool.QueryRow(r.Context(), query, args...).Scan(&returnedID)
	if err != nil {
		// No row returned = not found or RLS blocked.
		httputil.WriteError(w, http.StatusNotFound, "Không tìm thấy quy tắc hoặc không có quyền.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
