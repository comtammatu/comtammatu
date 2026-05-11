-- Go backend owns authentication — no dependency on auth.users or Supabase roles.

CREATE TABLE IF NOT EXISTS public.users (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id   BIGINT NOT NULL REFERENCES public.tenants(id),
    branch_id   BIGINT REFERENCES public.branches(id),
    email       TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    full_name   TEXT NOT NULL,
    phone       TEXT,
    user_role   TEXT NOT NULL DEFAULT 'cashier',
    position    TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (email, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON public.users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- Seed a default owner for tenant 1 (password: "changeme" hashed with bcrypt cost 12)
-- Run: go run tools/hash-password/main.go changeme to get real hash
-- Placeholder hash below — replace before first login
INSERT INTO public.users (tenant_id, email, password_hash, full_name, user_role)
VALUES (1, 'owner@comtammatu.local', '$2a$12$placeholder_replace_before_use_aaaaaaaaaaaaaaaaaaaaaa', 'Owner', 'owner')
ON CONFLICT DO NOTHING;
