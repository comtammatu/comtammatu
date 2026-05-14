-- Minimal schema for sqlc code generation.
-- Contains only the table definitions needed by internal/queries/*.sql.
-- Keep in sync with supabase/migrations when columns change.

CREATE TYPE public.staff_role AS ENUM (
  'owner',
  'super_manager',
  'area_manager',
  'branch_manager',
  'cashier',
  'waiter',
  'chef',
  'office'
);

CREATE TABLE public.tenants (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.branches (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  is_active BOOLEAN DEFAULT true,
  is_headquarters BOOLEAN DEFAULT false,
  pos_config JSONB NOT NULL DEFAULT '{"shift_start_time": "07:00", "cash_float_default": "0.00"}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.branch_zones (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES public.branches(id),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  name TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.menu_categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  name TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.menu_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  category_id BIGINT REFERENCES public.menu_categories(id),
  name TEXT NOT NULL,
  description TEXT,
  base_price NUMERIC(15,2) NOT NULL DEFAULT 0,
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.menu_item_variants (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  item_id BIGINT NOT NULL REFERENCES public.menu_items(id),
  name TEXT NOT NULL,
  price_adjustment NUMERIC(15,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0
);

CREATE TABLE public.menu_item_modifiers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  item_id BIGINT NOT NULL REFERENCES public.menu_items(id),
  name TEXT NOT NULL,
  price NUMERIC(15,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0
);

CREATE TABLE public.users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  branch_id BIGINT REFERENCES public.branches(id),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  user_role public.staff_role NOT NULL DEFAULT 'waiter',
  position TEXT,
  is_active BOOLEAN DEFAULT true,
  uuid UUID NOT NULL DEFAULT gen_random_uuid(),
  -- FK refs to areas/positions omitted: this stub only defines tables sqlc needs.
  avatar_url TEXT,
  area_id BIGINT,
  position_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
