package staff

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/mail"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/personal/comtammatu/backend/internal/httputil"
	"github.com/personal/comtammatu/backend/internal/middleware"
	"golang.org/x/crypto/bcrypt"
)

// Handler serves staff management endpoints under /admin/staff.
type Handler struct {
	pool *pgxpool.Pool
}

// New constructs a Handler.
func New(pool *pgxpool.Pool) *Handler {
	return &Handler{pool: pool}
}

// Routes returns a chi.Router with all staff sub-routes registered.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Get("/", h.listStaff)
	r.Post("/", h.createStaff)
	r.Get("/{id}", h.getStaff)
	r.Put("/{id}", h.updateStaff)
	r.Delete("/{id}", h.deactivateStaff)
	r.Get("/{id}/permissions", h.listPermissions)
	r.Post("/{id}/permissions", h.grantPermission)
	r.Delete("/{id}/permissions/{permKey}", h.revokePermission)

	return r
}

func parseID(r *http.Request) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
}

func (h *Handler) listStaff(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	const q = `SELECT id, tenant_id, full_name, email, user_role, branch_id, is_active, created_at
		FROM public.users
		WHERE tenant_id = $1
		ORDER BY full_name`
	rows, err := h.pool.Query(r.Context(), q, claims.TenantID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to fetch staff")
		return
	}
	defer rows.Close()
	result := make([]StaffMember, 0)
	for rows.Next() {
		var s StaffMember
		var branchID sql.NullInt64
		var isActive sql.NullBool
		var createdAt sql.NullTime
		var idVal int64
		if err := rows.Scan(&idVal, &s.TenantID, &s.FullName, &s.Email, &s.UserRole, &branchID, &isActive, &createdAt); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read staff")
			return
		}
		s.ID = strconv.FormatInt(idVal, 10)
		if branchID.Valid {
			s.BranchID = &branchID.Int64
		}
		if isActive.Valid {
			s.IsActive = isActive.Bool
		}
		if createdAt.Valid {
			s.CreatedAt = createdAt.Time.String()
		}
		result = append(result, s)
	}
	httputil.WriteJSON(w, http.StatusOK, result)
}

func (h *Handler) getStaff(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, err := parseID(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	const q = `SELECT id, tenant_id, full_name, email, user_role, branch_id, is_active, created_at
		FROM public.users
		WHERE id = $1 AND tenant_id = $2`
	var s StaffMember
	var idVal int64
	var branchID sql.NullInt64
	var isActive sql.NullBool
	var createdAt sql.NullTime
	if err := h.pool.QueryRow(r.Context(), q, id, claims.TenantID).Scan(&idVal, &s.TenantID, &s.FullName, &s.Email, &s.UserRole, &branchID, &isActive, &createdAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.WriteError(w, http.StatusNotFound, "staff not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to fetch staff")
		return
	}
	s.ID = strconv.FormatInt(idVal, 10)
	if branchID.Valid {
		s.BranchID = &branchID.Int64
	}
	if isActive.Valid {
		s.IsActive = isActive.Bool
	}
	if createdAt.Valid {
		s.CreatedAt = createdAt.Time.String()
	}
	httputil.WriteJSON(w, http.StatusOK, s)
}

func (h *Handler) createStaff(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req CreateStaffRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.FullName) == "" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "full_name is required")
		return
	}
	if _, err := mail.ParseAddress(req.Email); err != nil {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "email is invalid")
		return
	}
	if strings.TrimSpace(req.UserRole) == "" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "user_role is required")
		return
	}
	tmpHash, err := bcrypt.GenerateFromPassword([]byte("changeme"), bcrypt.DefaultCost)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to create staff")
		return
	}
	const q = `INSERT INTO public.users (tenant_id, branch_id, email, password_hash, full_name, user_role)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, tenant_id, full_name, email, user_role, branch_id, is_active, created_at`
	var s StaffMember
	var idVal int64
	var branchID sql.NullInt64
	var isActive sql.NullBool
	var createdAt sql.NullTime
	if err := h.pool.QueryRow(r.Context(), q, claims.TenantID, req.BranchID, req.Email, string(tmpHash), req.FullName, req.UserRole).
		Scan(&idVal, &s.TenantID, &s.FullName, &s.Email, &s.UserRole, &branchID, &isActive, &createdAt); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to create staff")
		return
	}
	s.ID = strconv.FormatInt(idVal, 10)
	if branchID.Valid {
		s.BranchID = &branchID.Int64
	}
	if isActive.Valid {
		s.IsActive = isActive.Bool
	}
	if createdAt.Valid {
		s.CreatedAt = createdAt.Time.String()
	}
	httputil.WriteJSON(w, http.StatusCreated, s)
}

func (h *Handler) updateStaff(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, err := parseID(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req UpdateStaffRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	const q = `UPDATE public.users
		SET full_name = COALESCE($1, full_name),
		    user_role = COALESCE($2, user_role),
		    branch_id = COALESCE($3, branch_id),
		    is_active = COALESCE($4, is_active),
		    updated_at = now()
		WHERE id = $5 AND tenant_id = $6
		RETURNING id, tenant_id, full_name, email, user_role, branch_id, is_active, created_at`
	var s StaffMember
	var idVal int64
	var branchID sql.NullInt64
	var isActive sql.NullBool
	var createdAt sql.NullTime
	if err := h.pool.QueryRow(r.Context(), q, req.FullName, req.UserRole, req.BranchID, req.IsActive, id, claims.TenantID).
		Scan(&idVal, &s.TenantID, &s.FullName, &s.Email, &s.UserRole, &branchID, &isActive, &createdAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.WriteError(w, http.StatusNotFound, "staff not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to update staff")
		return
	}
	s.ID = strconv.FormatInt(idVal, 10)
	if branchID.Valid {
		s.BranchID = &branchID.Int64
	}
	if isActive.Valid {
		s.IsActive = isActive.Bool
	}
	if createdAt.Valid {
		s.CreatedAt = createdAt.Time.String()
	}
	httputil.WriteJSON(w, http.StatusOK, s)
}

func (h *Handler) deactivateStaff(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, err := parseID(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	const q = `UPDATE public.users SET is_active = false, updated_at = now()
		WHERE id = $1 AND tenant_id = $2`
	if _, err := h.pool.Exec(r.Context(), q, id, claims.TenantID); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to deactivate staff")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) listPermissions(w http.ResponseWriter, _ *http.Request) {
	httputil.WriteError(w, http.StatusNotImplemented, "not implemented")
}

func (h *Handler) grantPermission(w http.ResponseWriter, r *http.Request) {
	var req GrantPermissionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.PermissionKey) == "" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "permission_key is required")
		return
	}
	httputil.WriteError(w, http.StatusNotImplemented, "not implemented")
}

func (h *Handler) revokePermission(w http.ResponseWriter, _ *http.Request) {
	httputil.WriteError(w, http.StatusNotImplemented, "not implemented")
}
