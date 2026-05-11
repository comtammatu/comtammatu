package config

import (
	"fmt"
	"os"
	"strings"

	"github.com/joho/godotenv"
	"github.com/personal/comtammatu/backend/internal/middleware"
)

const EnvironmentProduction = "production"

// Config holds all runtime configuration loaded from environment variables.
// Add new fields here when a new env var is introduced — never read os.Getenv
// directly in handlers or middleware.
type Config struct {
	AppEnv         string
	Port           string
	JWTSecret      string
	AllowedOrigins []string
}

// Load reads .env (if present) then environment variables.
// In production (no .env file) it silently continues with OS env.
func Load() (*Config, error) {
	// Ignore error — .env is optional in production
	_ = godotenv.Load()

	cfg := &Config{
		AppEnv:         getEnv("APP_ENV", "development"),
		Port:           getEnv("PORT", "8080"),
		JWTSecret:      os.Getenv("SUPABASE_JWT_SECRET"),
		AllowedOrigins: middleware.ParseOrigins(getEnv("ALLOWED_ORIGINS", "http://localhost:3000")),
	}

	if err := cfg.validate(); err != nil {
		return nil, err
	}

	return cfg, nil
}

func (c *Config) validate() error {
	var missing []string
	if c.JWTSecret == "" {
		missing = append(missing, "SUPABASE_JWT_SECRET")
	}
	if len(missing) > 0 {
		return fmt.Errorf("config: missing required env vars: %s", strings.Join(missing, ", "))
	}
	if len(c.AllowedOrigins) == 0 {
		return fmt.Errorf("config: ALLOWED_ORIGINS must contain at least one origin")
	}
	if c.AppEnv == EnvironmentProduction && middleware.ContainsWildcardOrigin(c.AllowedOrigins) {
		return fmt.Errorf("config: ALLOWED_ORIGINS cannot contain * in production")
	}
	return nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
