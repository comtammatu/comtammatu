package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/personal/comtammatu/backend/internal/auth"
)

type stubChecker struct{ allow bool }

func (s *stubChecker) Can(_ context.Context, _, _ int64, _ *int64, _ string) (bool, error) {
	return s.allow, nil
}

func claimsContext(userID, tenantID int64) *http.Request {
	req := httptest.NewRequest("GET", "/", nil)
	claims := &auth.Claims{UserID: userID, TenantID: tenantID, UserRole: auth.RoleOwner}
	return req.WithContext(context.WithValue(req.Context(), claimsKey, claims))
}

func TestRequirePermission(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) })

	t.Run("allowed", func(t *testing.T) {
		h := RequirePermission(&stubChecker{allow: true}, "menu:read")(next)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, claimsContext(1, 1))
		if rec.Code != 200 {
			t.Fatalf("want 200 got %d", rec.Code)
		}
	})

	t.Run("forbidden", func(t *testing.T) {
		h := RequirePermission(&stubChecker{allow: false}, "menu:read")(next)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, claimsContext(1, 1))
		if rec.Code != 403 {
			t.Fatalf("want 403 got %d", rec.Code)
		}
	})

	t.Run("no claims → 401", func(t *testing.T) {
		h := RequirePermission(&stubChecker{allow: true}, "menu:read")(next)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest("GET", "/", nil))
		if rec.Code != 401 {
			t.Fatalf("want 401 got %d", rec.Code)
		}
	})
}
