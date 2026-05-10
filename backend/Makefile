.PHONY: build run test lint tidy

build:
	go build -o bin/server ./cmd/server

run:
	go run ./cmd/server

test:
	go test -race -count=1 ./...

lint:
	golangci-lint run ./...

tidy:
	go mod tidy
