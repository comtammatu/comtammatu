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
	"github.com/personal/comtammatu/backend/internal/auth"
	cronpkg "github.com/personal/comtammatu/backend/internal/cron"
	"github.com/personal/comtammatu/backend/internal/db"
	authhandler "github.com/personal/comtammatu/backend/internal/handler/auth"
	employeehandler "github.com/personal/comtammatu/backend/internal/handler/employee"
	feedbackhandler "github.com/personal/comtammatu/backend/internal/handler/feedback"
	healthhandler "github.com/personal/comtammatu/backend/internal/handler/health"
	hrhandler "github.com/personal/comtammatu/backend/internal/handler/hr"
	kdshandler "github.com/personal/comtammatu/backend/internal/handler/kds"
	menuhandler "github.com/personal/comtammatu/backend/internal/handler/menu"
	notifhandler "github.com/personal/comtammatu/backend/internal/handler/notifications"
	ordershandler "github.com/personal/comtammatu/backend/internal/handler/orders"
	paymentshandler "github.com/personal/comtammatu/backend/internal/handler/payments"
	realtimehandler "github.com/personal/comtammatu/backend/internal/handler/realtime"
	settingshandler "github.com/personal/comtammatu/backend/internal/handler/settings"
	staffhandler "github.com/personal/comtammatu/backend/internal/handler/staff"
	webhookshandler "github.com/personal/comtammatu/backend/internal/handler/webhooks"
	"github.com/personal/comtammatu/backend/internal/middleware"
	"github.com/personal/comtammatu/backend/internal/realtime"
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

	hub := realtime.NewHub()
	go realtime.Listen(ctx, dsn, hub)

	scheduler := cronpkg.New(pool)
	scheduler.Register("feedback_daily_report", "0 19 * * *", cronpkg.FeedbackDailyReport(pool))
	scheduler.Register("feedback_retention", "0 20 * * *", cronpkg.FeedbackRetention(pool))
	scheduler.Register("telegram_flush", "*/5 * * * *", cronpkg.TelegramFlush(pool))
	scheduler.Register("hddt_daily_summary", "0 19 * * *", cronpkg.HDDTDailySummary(pool))
	scheduler.Start()
	defer func() {
		shutCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := scheduler.Stop(shutCtx); err != nil {
			slog.Warn("scheduler stop", "err", err)
		}
	}()

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

	// Feedback handler is constructed up here so PublicRoutes() can be mounted
	// outside the Authenticate group (token-gated public submission) while
	// AdminRoutes() mounts inside the group below.
	feedbackH := feedbackhandler.New(pool, eval)
	r.Mount("/", feedbackH.PublicRoutes())

	// Authenticated API routes — Authenticate middleware validates JWT
	r.Group(func(r chi.Router) {
		r.Use(middleware.Authenticate(cfg.JWTSecret))

		// /auth/me — any authenticated user; no module gate.
		r.Get("/auth/me", authH.Me)

		// WebSocket realtime feed — authenticated via ?token= query param
		// (browsers cannot set Authorization header on WS upgrade).
		r.Get("/ws", realtimehandler.Handler(hub, cfg.JWTSecret))

		// Module-gated route groups. RequireModule enforces the coarse
		// role→module ACL (mirrors apps/web/proxy.ts + module-acl.ts).
		// Branch-scoped routes additionally enforce RequireBranchScope so a
		// branch-scoped caller cannot reach another branch in the tenant.
		r.With(middleware.RequireModule(auth.ModuleMenu)).
			Mount("/menu", menuhandler.New(pool, eval).Routes())
		r.With(middleware.RequireModule(auth.ModuleStaff)).
			Mount("/admin/staff", staffhandler.New(pool, eval).Routes())

		settingsH := settingshandler.New(pool, eval)
		r.With(middleware.RequireModule(auth.ModuleSettings)).
			Mount("/admin/settings", settingsH.Routes())
		// Payment-settings live under /admin/settings/payments. Mounted
		// separately from the settings.Routes() group because the handler
		// gates on the tenant-level permission rather than the branch-level one.
		r.With(middleware.RequireModule(auth.ModuleSettings)).
			Get("/admin/settings/payments", settingsH.GetPayments)
		r.With(middleware.RequireModule(auth.ModuleSettings)).
			Put("/admin/settings/payments", settingsH.PutPayments)

		ordersH := ordershandler.New(pool, eval)
		r.With(middleware.RequireModule(auth.ModulePOS), middleware.RequireBranchScope).
			Mount("/br/{branchId}/orders", ordersH.Routes())
		r.With(middleware.RequireModule(auth.ModulePOS), middleware.RequireBranchScope,
			middleware.RequirePermission(eval, "pos:close_shift")).
			Post("/br/{branchId}/shifts/close", ordersH.CloseShift)
		r.With(middleware.RequireModule(auth.ModuleKDS), middleware.RequireBranchScope).
			Mount("/br/{branchId}/kds", kdshandler.New(pool, eval).Routes())
		r.With(middleware.RequireModule(auth.ModuleNotifications)).
			Mount("/notifications", notifhandler.New(pool, eval).Routes())
		r.With(middleware.RequireModule(auth.ModuleEmployee)).
			Mount("/employee", employeehandler.New(pool, eval).Routes())
		r.With(middleware.RequireModule(auth.ModuleHR)).
			Mount("/hr", hrhandler.New(pool, eval).Routes())
		r.With(middleware.RequireModule(auth.ModuleFeedback)).
			Mount("/admin/feedback", feedbackH.AdminRoutes())

		paymentsH := paymentshandler.New(pool, eval)
		r.With(middleware.RequireModule(auth.ModulePOS), middleware.RequireBranchScope).
			Mount("/br/{branchId}/payments", paymentsH.Routes())
		r.With(middleware.RequireModule(auth.ModulePOS), middleware.RequireBranchScope,
			middleware.RequirePermission(eval, "pos:confirm_payment")).
			Post("/br/{branchId}/orders/{id}/payment/vietqr/confirm", paymentsH.ConfirmVietQR)
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
