package config

import (
	"strings"
	"testing"
)

func TestValidateDoesNotRequireDatabaseURL(t *testing.T) {
	cfg := &Config{
		AppEnv:         EnvironmentProduction,
		Port:           "8080",
		JWTSecret:      "jwt-secret",
		AllowedOrigins: []string{"https://app.comtammatu.com"},
	}

	if err := cfg.validate(); err != nil {
		t.Fatalf("validate() error = %v, want nil", err)
	}
}

func TestValidateRejectsProductionWildcardCORS(t *testing.T) {
	cfg := &Config{
		AppEnv:         EnvironmentProduction,
		Port:           "8080",
		JWTSecret:      "jwt-secret",
		AllowedOrigins: []string{"*"},
	}

	err := cfg.validate()
	if err == nil {
		t.Fatal("validate() error = nil, want production wildcard rejection")
	}
	if !strings.Contains(err.Error(), "cannot contain * in production") {
		t.Fatalf("validate() error = %q, want wildcard production message", err)
	}
}

func TestLoadDefaultsToLocalhostCORS(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("PORT", "")
	t.Setenv("SUPABASE_JWT_SECRET", "jwt-secret")
	t.Setenv("ALLOWED_ORIGINS", "")
	t.Setenv("DATABASE_URL", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v, want nil", err)
	}
	if got, want := cfg.AllowedOrigins, []string{"http://localhost:3000"}; len(got) != 1 || got[0] != want[0] {
		t.Fatalf("AllowedOrigins = %#v, want %#v", got, want)
	}
}
