package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"

	"github.com/personal/comtammatu/backend/config"
	"github.com/personal/comtammatu/backend/internal/abac"
	"github.com/personal/comtammatu/backend/internal/db"
	authhandler "github.com/personal/comtammatu/backend/internal/handler/auth"
	healthhandler "github.com/personal/comtammatu/backend/internal/handler/health"
	kdshandler "github.com/personal/comtammatu/backend/internal/handler/kds"
	menuhandler "github.com/personal/comtammatu/backend/internal/handler/menu"
	notifhandler "github.com/personal/comtammatu/backend/internal/handler/notifications"
	ordershandler "github.com/personal/comtammatu/backend/internal/handler/orders"
	paymentshandler "github.com/personal/comtammatu/backend/internal/handler/payments"
	settingshandler "github.com/personal/comtammatu/backend/internal/handler/settings"
	staffhandler "github.com/personal/comtammatu/backend/internal/handler/staff"
	webhookshandler "github.com/personal/comtammatu/backend/internal/handler/webhooks"
	"github.com/personal/comtammatu/backend/internal/middleware"
)

func main() {
	// Structured JSON logging for production; text for local development
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

	cfg, err := config.Load()
	if err != nil {
		slog.Error("config load failed", "err", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	dsn := os.Getenv("DATABASE_URL")
	if cfg.AppEnv != "development" {
		if docker := os.Getenv("DATABASE_URL_DOCKER"); docker != "" {
			dsn = docker
		}
	}
	pool, err := db.Open(ctx, dsn)
	if err != nil {
		slog.Error("database connection failed", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	r := chi.NewRouter()

	// Global middleware stack (order matters)
	r.Use(chimiddleware.RequestID) // X-Request-Id header
	r.Use(chimiddleware.RealIP)    // honour X-Forwarded-For / X-Real-IP
	r.Use(middleware.Logger)
	r.Use(middleware.CORS(cfg.AllowedOrigins))
	r.Use(chimiddleware.Recoverer) // catch panics, return 500

	// Public routes — no auth required.
	// MoMo IPN webhook is public because the provider can't authenticate to us;
	// the HMAC signature on the body is the proof of authenticity.
	r.Get("/health", healthhandler.Handler())
	authH := authhandler.New(pool)
	r.Post("/auth/login", authH.Login)
	webhooksH := webhookshandler.New(pool)
	r.Post("/webhooks/momo", webhooksH.MoMo)

	eval := abac.New(pool)

	// Authenticated API routes — Authenticate middleware validates JWT
	r.Group(func(r chi.Router) {
		r.Use(middleware.Authenticate(cfg.JWTSecret))

		r.Get("/auth/me", authH.Me)
		r.Mount("/menu", menuhandler.New(pool, eval).Routes())
		r.Mount("/admin/staff", staffhandler.New(pool, eval).Routes())
		settingsH := settingshandler.New(pool, eval)
		r.Mount("/admin/settings", settingsH.Routes())
		// Payment-settings live under /admin/settings/payments. Mounted
		// separately from the settings.Routes() group because they gate on
		// the tenant-level permission rather than the branch-level one.
		r.Get("/admin/settings/payments", settingsH.GetPayments)
		r.Put("/admin/settings/payments", settingsH.PutPayments)

		ordersH := ordershandler.New(pool)
		r.Mount("/br/{branchId}/orders", ordersH.Routes())
		r.Post("/br/{branchId}/shifts/close", ordersH.CloseShift)
		r.Mount("/br/{branchId}/kds", kdshandler.New(pool).Routes())
		r.Mount("/notifications", notifhandler.New(pool).Routes())

		paymentsH := paymentshandler.New(pool)
		r.Mount("/br/{branchId}/payments", paymentsH.Routes())
		r.Post("/br/{branchId}/orders/{id}/payment/vietqr/confirm", paymentsH.ConfirmVietQR)
	})

	srv := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.Port),
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in background, block until shutdown signal
	go func() {
		slog.Info("server starting", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	slog.Info("shutdown signal received")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("graceful shutdown failed", "err", err)
		os.Exit(1)
	}
	slog.Info("server stopped cleanly")
}
