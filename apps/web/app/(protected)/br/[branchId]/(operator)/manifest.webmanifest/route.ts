import type { NextRequest } from "next/server";
import { buildOperationalManifestResponse } from "../../_lib/operational-manifest";

export const revalidate = 3600;

interface ManifestParams {
  params: Promise<{ branchId: string }>;
}

export async function GET(_request: NextRequest, { params }: ManifestParams) {
  const { branchId: rawBranchId } = await params;
  return buildOperationalManifestResponse("operator", rawBranchId);
}
