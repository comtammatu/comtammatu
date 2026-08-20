import type { NextRequest } from "next/server";
import { buildOperationalManifestResponse } from "../../_lib/operational-manifest";


interface ManifestParams {
  params: Promise<{ branchId: string }>;
}

export async function GET(_request: NextRequest, { params }: ManifestParams) {
  const { branchId: rawBranchId } = await params;
  return buildOperationalManifestResponse("pos", rawBranchId);
}
