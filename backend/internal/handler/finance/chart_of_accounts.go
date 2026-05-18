package finance

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/personal/comtammatu/backend/internal/db"
	"github.com/personal/comtammatu/backend/internal/httputil"
)

// ─── GET /finance/chart-of-accounts ──────────────────────────────────────────

func (h *Handler) listChartOfAccounts(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	const q = `
		SELECT id, account_code, account_name, account_type, parent_id, level, is_active, created_at
		FROM public.chart_of_accounts
		WHERE tenant_id = $1
		ORDER BY account_code`

	rows, err := h.pool.Query(r.Context(), q, claims.TenantID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải hệ thống tài khoản.")
		return
	}
	defer rows.Close()

	type accountRow struct {
		ID          int64  `json:"id"`
		AccountCode string `json:"account_code"`
		AccountName string `json:"account_name"`
		AccountType string `json:"account_type"`
		ParentID    *int64 `json:"parent_id"`
		Level       *int   `json:"level"`
		IsActive    bool   `json:"is_active"`
		CreatedAt   string `json:"created_at"`
	}

	out := make([]accountRow, 0)
	for rows.Next() {
		var a accountRow
		var createdAt time.Time
		if err := rows.Scan(
			&a.ID, &a.AccountCode, &a.AccountName, &a.AccountType,
			&a.ParentID, &a.Level, &a.IsActive, &createdAt,
		); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read account")
			return
		}
		a.CreatedAt = createdAt.Format(time.RFC3339)
		out = append(out, a)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": out})
}

// ─── POST /finance/chart-of-accounts ─────────────────────────────────────────

type createAccountBody struct {
	AccountCode string `json:"account_code"`
	AccountName string `json:"account_name"`
	AccountType string `json:"account_type"`
	ParentID    *int64 `json:"parent_id"`
	Level       *int   `json:"level"`
}

func (h *Handler) createAccount(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var body createAccountBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.AccountCode == "" || len(body.AccountCode) > 20 {
		httputil.WriteError(w, http.StatusBadRequest, "Mã tài khoản không được trống hoặc quá dài")
		return
	}
	if body.AccountName == "" || len(body.AccountName) > 200 {
		httputil.WriteError(w, http.StatusBadRequest, "Tên tài khoản không được trống hoặc quá dài")
		return
	}
	validTypes := map[string]bool{"asset": true, "liability": true, "equity": true, "revenue": true, "expense": true}
	if !validTypes[body.AccountType] {
		httputil.WriteError(w, http.StatusBadRequest, "Loại tài khoản không hợp lệ")
		return
	}

	level := 1
	if body.Level != nil {
		level = *body.Level
	}

	var id int64
	var code, name string
	err := h.pool.QueryRow(r.Context(),
		`INSERT INTO public.chart_of_accounts
		 (tenant_id, account_code, account_name, account_type, parent_id, level)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, account_code, account_name`,
		claims.TenantID, body.AccountCode, body.AccountName, body.AccountType, body.ParentID, level,
	).Scan(&id, &code, &name)
	if err != nil {
		status, msg := mapRPCError(err, "Không thể tạo tài khoản.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, map[string]any{
		"id": id, "account_code": code, "account_name": name,
	})
}

// ─── PUT /finance/chart-of-accounts/{id} ─────────────────────────────────────

type updateAccountBody struct {
	AccountName string `json:"account_name"`
	AccountType string `json:"account_type"`
	ParentID    *int64 `json:"parent_id"`
	Level       *int   `json:"level"`
}

func (h *Handler) updateAccount(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	accountID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var body updateAccountBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.AccountName == "" || len(body.AccountName) > 200 {
		httputil.WriteError(w, http.StatusBadRequest, "Tên tài khoản không được trống hoặc quá dài")
		return
	}
	validTypes := map[string]bool{"asset": true, "liability": true, "equity": true, "revenue": true, "expense": true}
	if !validTypes[body.AccountType] {
		httputil.WriteError(w, http.StatusBadRequest, "Loại tài khoản không hợp lệ")
		return
	}

	_, err := h.pool.Exec(r.Context(),
		`UPDATE public.chart_of_accounts
		 SET account_name = $1, account_type = $2, parent_id = $3, level = $4
		 WHERE id = $5 AND tenant_id = $6`,
		body.AccountName, body.AccountType, body.ParentID, body.Level, accountID, claims.TenantID,
	)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể cập nhật tài khoản.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── POST /finance/chart-of-accounts/{id}/toggle ─────────────────────────────

func (h *Handler) toggleAccountActive(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	accountID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var isActive bool
	err := h.pool.QueryRow(r.Context(),
		`SELECT is_active FROM public.chart_of_accounts WHERE id = $1 AND tenant_id = $2`,
		accountID, claims.TenantID,
	).Scan(&isActive)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "Tài khoản không tồn tại.")
		return
	}

	_, err = h.pool.Exec(r.Context(),
		`UPDATE public.chart_of_accounts SET is_active = $1 WHERE id = $2 AND tenant_id = $3`,
		!isActive, accountID, claims.TenantID,
	)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể thay đổi trạng thái.")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"is_active": !isActive})
}

// ─── POST /finance/chart-of-accounts/seed ────────────────────────────────────
// RPC seed_chart_of_accounts does not use auth.uid() — takes p_tenant_id explicitly.

func (h *Handler) seedChartOfAccounts(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(), `SELECT public.seed_chart_of_accounts($1)`, claims.TenantID)
		return err
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể khởi tạo hệ thống tài khoản.")
		httputil.WriteError(w, status, msg)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
