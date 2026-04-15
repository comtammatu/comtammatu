type BranchKindSchemaQuery = {
  limit: (count: number) => {
    maybeSingle: () => PromiseLike<{
      error: { code?: string; message?: string } | null;
    }>;
  };
};

type BranchKindSchemaClient = {
  from: (table: "branches") => {
    select: (columns: string) => BranchKindSchemaQuery;
  };
};

export async function hasBranchKindSchema(
  supabase: BranchKindSchemaClient,
): Promise<boolean> {
  const { error } = await supabase
    .from("branches")
    .select("branch_kind")
    .limit(1)
    .maybeSingle();

  return error?.code !== "42703";
}
