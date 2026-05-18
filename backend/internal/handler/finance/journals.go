package finance

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/personal/comtammatu/backend/internal/db"
	"github.com/personal/comtammatu/backend/internal/httputil"
)

// ─── GET /finance/journals ────────────────────────────────────────────────────

func (h *Handler) listJournals(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")
	status := r.URL.Query().Get("status")
	refType := r.URL.Query().Get("reference_type")

	const q = `
		SELECT id, entry_number, entry_date, description, reference_type, reference_id, status, created_at
		FROM public.journal_entries
		WHERE tenant_id = $1
		  AND ($2::date IS NULL OR entry_date >= $2::date)
		  AND ($3::date IS NULL OR entry_date <= $3::date)
		  AND ($4::text IS NULL OR status = $4)
		  AND ($5::text IS NULL OR reference_type = $5)
		ORDER BY entry_date DESC, created_at DESC
		LIMIT 200`

	var sArg, eArg, stArg, rtArg *string
	if isDate(startDate) {
		sArg = &startDate
	}
	if isDate(endDate) {
		eArg = &endDate
	}
	if status != "" {
		stArg = &status
	}
	if refType != "" {
		rtArg = &refType
	}

	rows, err := h.pool.Query(r.Context(), q, claims.TenantID, sArg, eArg, stArg, rtArg)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải danh sách bút toán.")
		return
	}
	defer rows.Close()

	type journalRow struct {
		ID            int64   `json:"id"`
		EntryNumber   *string `json:"entry_number"`
		EntryDate     string  `json:"entry_date"`
		Description   string  `json:"description"`
		ReferenceType *string `json:"reference_type"`
		ReferenceID   *int64  `json:"reference_id"`
		Status        string  `json:"status"`
		CreatedAt     string  `json:"created_at"`
	}

	out := make([]journalRow, 0)
	for rows.Next() {
		var j journalRow
		var entryDate, createdAt time.Time
		if err := rows.Scan(
			&j.ID, &j.EntryNumber, &entryDate, &j.Description,
			&j.ReferenceType, &j.ReferenceID, &j.Status, &createdAt,
		); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read journal")
			return
		}
		j.EntryDate = entryDate.Format("2006-01-02")
		j.CreatedAt = createdAt.Format(time.RFC3339)
		out = append(out, j)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": out})
}

// ─── POST /finance/journals ───────────────────────────────────────────────────
// RPC create_manual_journal_entry uses auth.uid() → WithAuthContext.

type journalLine struct {
	AccountID    int64   `json:"account_id"`
	DebitAmount  float64 `json:"debit_amount"`
	CreditAmount float64 `json:"credit_amount"`
	Description  *string `json:"description"`
}

type createJournalBody struct {
	EntryDate     string        `json:"entry_date"`
	Description   string        `json:"description"`
	ReferenceType string        `json:"reference_type"`
	ReferenceID   *int64        `json:"reference_id"`
	BranchID      *int64        `json:"branch_id"`
	Lines         []journalLine `json:"lines"`
}

func (h *Handler) createJournal(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var body createJournalBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !isDate(body.EntryDate) {
		httputil.WriteError(w, http.StatusBadRequest, "entry_date không hợp lệ (YYYY-MM-DD)")
		return
	}
	if body.Description == "" {
		httputil.WriteError(w, http.StatusBadRequest, "Diễn giải không được trống")
		return
	}
	if len(body.Lines) < 2 {
		httputil.WriteError(w, http.StatusBadRequest, "Bút toán phải có ít nhất 2 dòng")
		return
	}

	// Validate balance.
	var totalDebit, totalCredit float64
	for _, l := range body.Lines {
		totalDebit += l.DebitAmount
		totalCredit += l.CreditAmount
	}
	if totalDebit == 0 {
		httputil.WriteError(w, http.StatusBadRequest, "Bút toán phải có giá trị > 0")
		return
	}
	diff := totalDebit - totalCredit
	if diff < -0.01 || diff > 0.01 {
		httputil.WriteError(w, http.StatusBadRequest, "Bút toán không cân: Nợ ≠ Có")
		return
	}

	refType := body.ReferenceType
	if refType == "" {
		refType = "manual"
	}

	// Build lines JSON for RPC.
	type rpcLine struct {
		AccountID    int64   `json:"account_id"`
		DebitAmount  float64 `json:"debit_amount"`
		CreditAmount float64 `json:"credit_amount"`
		Description  *string `json:"description"`
	}
	rpcLines := make([]rpcLine, len(body.Lines))
	for i, l := range body.Lines {
		rpcLines[i] = rpcLine{
			AccountID:    l.AccountID,
			DebitAmount:  l.DebitAmount,
			CreditAmount: l.CreditAmount,
			Description:  l.Description,
		}
	}
	linesJSON, _ := json.Marshal(rpcLines)

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.create_manual_journal_entry($1::date, $2, $3::jsonb, $4, $5, $6)`,
			body.EntryDate, body.Description, linesJSON, refType, body.ReferenceID, body.BranchID,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapJournalError(rpcErr)
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, json.RawMessage(raw))
}

// ─── POST /finance/journals/{id}/post ────────────────────────────────────────
// RPC post_manual_journal_entry uses auth.uid() → WithAuthContext.

func (h *Handler) postJournal(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	entryID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.post_manual_journal_entry($1)`, entryID,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapJournalError(rpcErr)
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(raw))
}

// ─── POST /finance/journals/{id}/void ────────────────────────────────────────
// RPC void_manual_journal_entry uses auth.uid() → WithAuthContext.

func (h *Handler) voidJournal(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	entryID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var body struct {
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len([]rune(body.Reason)) < 20 {
		httputil.WriteError(w, http.StatusBadRequest, "Lý do hủy phải có ít nhất 20 ký tự")
		return
	}
	if len([]rune(body.Reason)) > 500 {
		httputil.WriteError(w, http.StatusBadRequest, "Lý do hủy quá dài")
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.void_manual_journal_entry($1, $2)`, entryID, body.Reason,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapJournalError(rpcErr)
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(raw))
}

// mapJournalError mirrors mapJournalMutationError from journal-actions.ts.
func mapJournalError(err error) (int, string) {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "42501":
			return http.StatusForbidden, "Không có quyền"
		case "P0002":
			return http.StatusNotFound, "Bút toán không tồn tại."
		case "23503":
			return http.StatusUnprocessableEntity, "Tài khoản kế toán không hợp lệ."
		case "23505":
			return http.StatusConflict, "Số bút toán bị trùng. Vui lòng thử lại."
		case "22023":
			return http.StatusUnprocessableEntity, "Dữ liệu bút toán không hợp lệ."
		case "23514":
			switch {
			case strings.Contains(pgErr.Message, "fiscal_period_closed_cannot_post"),
				strings.Contains(pgErr.Message, "current_period_closed_cannot_reverse"):
				return http.StatusConflict, "Không thể ghi sổ vào kỳ kế toán đã đóng."
			case strings.Contains(pgErr.Message, "period_closed_cannot_void"):
				return http.StatusConflict, "Không thể hủy bút toán đã ghi vào kỳ kế toán đã đóng."
			}
		}
	}
	return http.StatusInternalServerError, "Không thể xử lý bút toán."
}
