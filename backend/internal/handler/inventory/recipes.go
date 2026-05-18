package inventory

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/personal/comtammatu/backend/internal/db"
	"github.com/personal/comtammatu/backend/internal/httputil"
)

func (h *Handler) registerRecipeRoutes(r chi.Router) {
	// Production recipes (BOM)
	r.Get("/production-recipes", h.listProductionRecipes)
	r.Post("/production-recipes", h.upsertProductionRecipe)
	r.Delete("/production-recipes/{id}", h.deleteProductionRecipe)
	r.Post("/production-recipes/lines", h.upsertProductionRecipeLines)
	r.Delete("/production-recipes/group/{finishedGoodId}", h.deleteProductionRecipeGroup)

	// Export / import BOM
	r.Get("/production-recipes/export", h.exportProductionRecipes)
	r.Post("/production-recipes/import", h.importProductionRecipes)
	r.Get("/production-recipes/template", h.downloadProductionRecipeTemplate)
}

// ─── GET /inventory/production-recipes ──────────────────────────────────────

func (h *Handler) listProductionRecipes(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.list_production_recipes()`,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tải công thức sản xuất.")
		httputil.WriteError(w, status, msg)
		return
	}
	if raw == nil {
		raw = json.RawMessage("[]")
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

// ─── POST /inventory/production-recipes ─────────────────────────────────────

func (h *Handler) upsertProductionRecipe(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Body không hợp lệ")
		return
	}

	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		b, _ := json.Marshal(body)
		_, err := tx.Exec(r.Context(), `SELECT public.upsert_production_recipe($1::jsonb)`, string(b))
		return err
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể lưu công thức.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// ─── DELETE /inventory/production-recipes/{id} ──────────────────────────────

func (h *Handler) deleteProductionRecipe(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	id, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(),
			`DELETE FROM production_recipes WHERE id = $1`, id)
		return err
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể xóa công thức.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// ─── POST /inventory/production-recipes/lines ───────────────────────────────

func (h *Handler) upsertProductionRecipeLines(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Body không hợp lệ")
		return
	}

	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		b, _ := json.Marshal(body)
		_, err := tx.Exec(r.Context(), `SELECT public.upsert_production_recipe_lines($1::jsonb)`, string(b))
		return err
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể lưu BOM sản xuất.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// ─── DELETE /inventory/production-recipes/group/{finishedGoodId} ────────────

func (h *Handler) deleteProductionRecipeGroup(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	fgID, ok := requirePathInt(w, chi.URLParam(r, "finishedGoodId"))
	if !ok {
		return
	}

	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(),
			`DELETE FROM production_recipes WHERE finished_good_id = $1`, fgID)
		return err
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể xóa công thức cũ.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// ─── GET /inventory/production-recipes/export ───────────────────────────────

func (h *Handler) exportProductionRecipes(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	format := r.URL.Query().Get("format")
	if format != "csv" && format != "xlsx" {
		format = "xlsx"
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.export_production_recipes($1)`, format,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể xuất BOM sản xuất.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

// ─── POST /inventory/production-recipes/import ──────────────────────────────

func (h *Handler) importProductionRecipes(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Body không hợp lệ")
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		b, _ := json.Marshal(body)
		return tx.QueryRow(r.Context(),
			`SELECT public.import_production_recipes($1::jsonb)`, string(b),
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể import BOM sản xuất.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

// ─── GET /inventory/production-recipes/template ─────────────────────────────

func (h *Handler) downloadProductionRecipeTemplate(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.download_production_recipe_template()`,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tải template BOM.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}
