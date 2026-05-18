package inventory

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/personal/comtammatu/backend/internal/httputil"
)

func (h *Handler) registerSupplierRoutes(r chi.Router) {
	r.Get("/suppliers", h.listSuppliers)
	r.Post("/suppliers", h.createSupplier)
	r.Put("/suppliers/{id}", h.updateSupplier)
	r.Delete("/suppliers/{id}", h.deleteSupplier)
}

type supplierRow struct {
	ID               int64   `json:"id"`
	Name             string  `json:"name"`
	TaxCode          *string `json:"tax_code"`
	Phone            *string `json:"phone"`
	Address          *string `json:"address"`
	Notes            *string `json:"notes"`
	IsActive         bool    `json:"is_active"`
	PaymentTermsDays *int    `json:"payment_terms_days"`
	PaymentTermsNote *string `json:"payment_terms_note"`
	CreatedAt        string  `json:"created_at"`
}

func (h *Handler) listSuppliers(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	const q = `SELECT id, name, tax_code, phone, address, notes, is_active,
	             payment_terms_days, payment_terms_note, created_at
	    FROM public.suppliers
	    WHERE tenant_id = $1
	    ORDER BY name`
	rows, err := h.pool.Query(r.Context(), q, claims.TenantID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải danh sách NCC.")
		return
	}
	defer rows.Close()

	out := make([]supplierRow, 0)
	for rows.Next() {
		var s supplierRow
		var tax, phone, addr, notes, ptNote sql.NullString
		var ptDays sql.NullInt32
		var createdAt time.Time
		if err := rows.Scan(&s.ID, &s.Name, &tax, &phone, &addr, &notes, &s.IsActive,
			&ptDays, &ptNote, &createdAt); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read supplier")
			return
		}
		if tax.Valid {
			v := tax.String
			s.TaxCode = &v
		}
		if phone.Valid {
			v := phone.String
			s.Phone = &v
		}
		if addr.Valid {
			v := addr.String
			s.Address = &v
		}
		if notes.Valid {
			v := notes.String
			s.Notes = &v
		}
		if ptDays.Valid {
			v := int(ptDays.Int32)
			s.PaymentTermsDays = &v
		}
		if ptNote.Valid {
			v := ptNote.String
			s.PaymentTermsNote = &v
		}
		s.CreatedAt = createdAt.Format(time.RFC3339)
		out = append(out, s)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": out})
}

type supplierBody struct {
	Name             string  `json:"name"`
	TaxCode          *string `json:"tax_code"`
	Phone            *string `json:"phone"`
	Address          *string `json:"address"`
	Notes            *string `json:"notes"`
	PaymentTermsDays *int    `json:"payment_terms_days"`
	PaymentTermsNote *string `json:"payment_terms_note"`
}

func (h *Handler) createSupplier(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	var body supplierBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Name == "" {
		httputil.WriteError(w, http.StatusBadRequest, "Tên NCC không được để trống")
		return
	}
	var id int64
	err := h.pool.QueryRow(r.Context(),
		`INSERT INTO public.suppliers
		   (tenant_id, name, tax_code, phone, address, notes,
		    payment_terms_days, payment_terms_note)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING id`,
		claims.TenantID, body.Name, body.TaxCode, body.Phone, body.Address, body.Notes,
		body.PaymentTermsDays, body.PaymentTermsNote,
	).Scan(&id)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			httputil.WriteError(w, http.StatusConflict, "Tên NCC đã tồn tại.")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tạo NCC.")
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, map[string]any{"id": id})
}

func (h *Handler) updateSupplier(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	supplierID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || supplierID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "ID không hợp lệ")
		return
	}
	var body supplierBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Name == "" {
		httputil.WriteError(w, http.StatusBadRequest, "Tên NCC không được để trống")
		return
	}
	tag, dbErr := h.pool.Exec(r.Context(),
		`UPDATE public.suppliers
		   SET name = $1, tax_code = $2, phone = $3, address = $4, notes = $5,
		       payment_terms_days = $6, payment_terms_note = $7
		 WHERE id = $8 AND tenant_id = $9`,
		body.Name, body.TaxCode, body.Phone, body.Address, body.Notes,
		body.PaymentTermsDays, body.PaymentTermsNote,
		supplierID, claims.TenantID,
	)
	if dbErr != nil {
		var pgErr *pgconn.PgError
		if errors.As(dbErr, &pgErr) && pgErr.Code == "23505" {
			httputil.WriteError(w, http.StatusConflict, "Tên NCC đã tồn tại.")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể cập nhật NCC.")
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.WriteError(w, http.StatusNotFound, "Không tìm thấy NCC.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) deleteSupplier(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	supplierID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || supplierID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "ID không hợp lệ")
		return
	}
	tag, dbErr := h.pool.Exec(r.Context(),
		`DELETE FROM public.suppliers WHERE id = $1 AND tenant_id = $2`,
		supplierID, claims.TenantID,
	)
	if dbErr != nil {
		var pgErr *pgconn.PgError
		if errors.As(dbErr, &pgErr) && pgErr.Code == "23503" {
			httputil.WriteError(w, http.StatusConflict, "Không thể xóa — NCC đang được dùng trong đơn hàng.")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể xóa NCC.")
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.WriteError(w, http.StatusNotFound, "Không tìm thấy NCC.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
