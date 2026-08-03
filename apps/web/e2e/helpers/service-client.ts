import {
  createClient,
  type SupabaseClient,
  type SupabaseClientOptions,
} from "@supabase/supabase-js";
import type { Database } from "@comtammatu/database";
import { requireIsolatedE2EEnvironment } from "./environment";

type DatabaseSchemaName = string & keyof Omit<Database, "__InternalSupabase">;

/**
 * The only E2E boundary allowed to read service credentials.
 * Every caller is therefore protected by the same loopback-only environment check.
 */
export function createE2EServiceClient(
  options?: SupabaseClientOptions<"public">,
): SupabaseClient<Database>;
export function createE2EServiceClient<SchemaName extends DatabaseSchemaName>(
  schema: SchemaName,
  options?: SupabaseClientOptions<SchemaName>,
): SupabaseClient<Database, SchemaName, SchemaName>;
export function createE2EServiceClient(
  schemaOrOptions:
    DatabaseSchemaName | SupabaseClientOptions<DatabaseSchemaName> = {},
  options: SupabaseClientOptions<DatabaseSchemaName> = {},
) {
  const { supabaseUrl } = requireIsolatedE2EEnvironment();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY must be set for E2E tests");
  }

  const clientOptions: SupabaseClientOptions<DatabaseSchemaName> =
    typeof schemaOrOptions === "string"
      ? {
          ...options,
          db: { ...options.db, schema: schemaOrOptions },
        }
      : schemaOrOptions;

  return createClient<Database, DatabaseSchemaName, DatabaseSchemaName>(
    supabaseUrl,
    key,
    {
      ...clientOptions,
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        ...clientOptions.auth,
      },
    },
  );
}

export type E2EServiceClient = SupabaseClient<Database>;
