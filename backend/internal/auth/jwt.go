package auth

import (
	"errors"
	"fmt"

	"github.com/golang-jwt/jwt/v5"
)

// supabaseClaims wraps the standard JWT registered claims with our custom fields.
// Supabase signs tokens with HS256 using SUPABASE_JWT_SECRET.
type supabaseClaims struct {
	jwt.RegisteredClaims
	TenantID int64     `json:"tenant_id"`
	BranchID *int64    `json:"branch_id"`
	AreaID   *int64    `json:"area_id"`
	UserRole StaffRole `json:"user_role"`
	Position string    `json:"position,omitempty"`
}

var (
	ErrTokenMissing  = errors.New("auth: token missing")
	ErrTokenInvalid  = errors.New("auth: token invalid")
	ErrClaimsMissing = errors.New("auth: custom claims missing (JWT hook may not have fired)")
)

// ParseToken validates a Supabase-issued JWT and extracts custom claims.
// secret is the raw SUPABASE_JWT_SECRET value (not base64-encoded).
func ParseToken(tokenStr, secret string) (*Claims, error) {
	if tokenStr == "" {
		return nil, ErrTokenMissing
	}

	parsed, err := jwt.ParseWithClaims(tokenStr, &supabaseClaims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("auth: unexpected signing method %v", t.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil || !parsed.Valid {
		return nil, fmt.Errorf("%w: %w", ErrTokenInvalid, err)
	}

	sc, ok := parsed.Claims.(*supabaseClaims)
	if !ok {
		return nil, ErrTokenInvalid
	}
	// tenant_id == 0 means the hook did not fire (e.g. service-role token or hook misconfigured).
	if sc.TenantID == 0 {
		return nil, ErrClaimsMissing
	}

	return &Claims{
		TenantID: sc.TenantID,
		BranchID: sc.BranchID,
		AreaID:   sc.AreaID,
		UserRole: sc.UserRole,
		Position: sc.Position,
	}, nil
}
