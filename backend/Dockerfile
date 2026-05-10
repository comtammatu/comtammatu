# syntax=docker/dockerfile:1

# ── Build stage ──────────────────────────────────────────────────────────────
FROM golang:1.25-alpine AS builder

WORKDIR /app

# Cache dependency download separately from source copy
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# CGO disabled for a fully static binary; -ldflags trims debug info
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o bin/server ./cmd/server

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM gcr.io/distroless/static-debian12

WORKDIR /app

COPY --from=builder /app/bin/server .

EXPOSE 8080

USER nonroot:nonroot

ENTRYPOINT ["/app/server"]
