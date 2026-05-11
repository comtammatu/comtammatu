package notifications

import (
	"database/sql"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/personal/comtammatu/backend/internal/httputil"
	"github.com/personal/comtammatu/backend/internal/middleware"
)

// Handler serves notification endpoints.
type Handler struct{ pool *pgxpool.Pool }

// New constructs a Handler.
func New(pool *pgxpool.Pool) *Handler { return &Handler{pool: pool} }

// Routes returns a chi.Router with notification sub-routes.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", h.list)
	r.Get("/unread-count", h.unreadCount)
	r.Patch("/{id}/read", h.markRead)
	r.Patch("/read-all", h.markAllRead)
	return r
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var cursor int64
	if c := r.URL.Query().Get("cursor"); c != "" {
		var err error
		cursor, err = strconv.ParseInt(c, 10, 64)
		if err != nil {
			httputil.WriteError(w, http.StatusBadRequest, "invalid cursor")
			return
		}
	}

	var rows interface {
		Next() bool
		Close()
		Scan(...any) error
	}
	var err error

	if cursor > 0 {
		const q = `
			SELECT n.id, n.tenant_id, n.kind, n.severity, n.title, n.body,
			       n.entity_type, n.entity_id, n.action_url,
			       (nr.notification_id IS NOT NULL) AS is_read,
			       n.created_at
			FROM public.notifications n
			LEFT JOIN public.notification_reads nr
			  ON nr.notification_id = n.id AND nr.user_id = auth.uid()
			WHERE n.tenant_id = $1
			  AND n.id < $2
			  AND (n.expires_at IS NULL OR n.expires_at > now())
			ORDER BY n.created_at DESC
			LIMIT 50`
		rows, err = h.pool.Query(r.Context(), q, claims.TenantID, cursor)
	} else {
		const q = `
			SELECT n.id, n.tenant_id, n.kind, n.severity, n.title, n.body,
			       n.entity_type, n.entity_id, n.action_url,
			       (nr.notification_id IS NOT NULL) AS is_read,
			       n.created_at
			FROM public.notifications n
			LEFT JOIN public.notification_reads nr
			  ON nr.notification_id = n.id AND nr.user_id = auth.uid()
			WHERE n.tenant_id = $1
			  AND (n.expires_at IS NULL OR n.expires_at > now())
			ORDER BY n.created_at DESC
			LIMIT 50`
		rows, err = h.pool.Query(r.Context(), q, claims.TenantID)
	}
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to fetch notifications")
		return
	}
	defer rows.Close()

	result := make([]Notification, 0)
	for rows.Next() {
		var n Notification
		var body, entityType, actionURL sql.NullString
		var entityID sql.NullInt64
		var createdAt sql.NullTime
		if err := rows.Scan(&n.ID, &n.TenantID, &n.Kind, &n.Severity, &n.Title,
			&body, &entityType, &entityID, &actionURL, &n.IsRead, &createdAt); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read notification")
			return
		}
		if body.Valid {
			n.Body = &body.String
		}
		if entityType.Valid {
			n.EntityType = &entityType.String
		}
		if entityID.Valid {
			n.EntityID = &entityID.Int64
		}
		if actionURL.Valid {
			n.ActionURL = &actionURL.String
		}
		if createdAt.Valid {
			n.CreatedAt = createdAt.Time.String()
		}
		result = append(result, n)
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"notifications": result})
}

func (h *Handler) unreadCount(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Use the existing RPC which already handles RLS visibility.
	var count int64
	if err := h.pool.QueryRow(r.Context(), `SELECT public.count_unread_notifications()`).Scan(&count); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to count unread")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"unread_count": count})
}

func (h *Handler) markRead(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}

	// Verify the notification belongs to caller's tenant before inserting read.
	var exists bool
	if err := h.pool.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM public.notifications WHERE id = $1 AND tenant_id = $2)`,
		id, claims.TenantID,
	).Scan(&exists); err != nil || !exists {
		httputil.WriteError(w, http.StatusNotFound, "notification not found")
		return
	}

	const q = `INSERT INTO public.notification_reads (notification_id, user_id, read_at)
		VALUES ($1, auth.uid(), now())
		ON CONFLICT (notification_id, user_id) DO NOTHING`
	if _, err := h.pool.Exec(r.Context(), q, id); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to mark read")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) markAllRead(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Use the existing RPC which handles visibility + conflict safely.
	var marked int64
	if err := h.pool.QueryRow(r.Context(), `SELECT public.mark_all_notifications_read()`).Scan(&marked); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to mark all read")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"marked": marked})
}
