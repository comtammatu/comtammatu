export type FulfillSiteKind = "central_supply" | "central_kitchen";

export type FulfillSiteFlags = {
  fulfillFromCentralSupply: boolean;
  fulfillFromCentralKitchen: boolean;
};

export function hasAllowedFulfillSite(flags: FulfillSiteFlags): boolean {
  return flags.fulfillFromCentralSupply || flags.fulfillFromCentralKitchen;
}

export function exclusiveFulfillSiteKind(
  flags: FulfillSiteFlags,
): FulfillSiteKind | null {
  if (flags.fulfillFromCentralSupply) return "central_supply";
  if (flags.fulfillFromCentralKitchen) return "central_kitchen";
  return null;
}

export function flagsFromExclusiveKind(
  kind: FulfillSiteKind | null | undefined,
): FulfillSiteFlags {
  return {
    fulfillFromCentralSupply: kind === "central_supply",
    fulfillFromCentralKitchen: kind === "central_kitchen",
  };
}

export function resolveFulfillSiteFlags(input: {
  fulfillFromCentralSupply?: boolean | null;
  fulfillFromCentralKitchen?: boolean | null;
  defaultFulfillSiteKind?: FulfillSiteKind | null;
}): FulfillSiteFlags {
  if (
    input.fulfillFromCentralSupply != null ||
    input.fulfillFromCentralKitchen != null
  ) {
    return {
      fulfillFromCentralSupply: input.fulfillFromCentralSupply === true,
      fulfillFromCentralKitchen: input.fulfillFromCentralKitchen === true,
    };
  }
  return flagsFromExclusiveKind(input.defaultFulfillSiteKind);
}

/** OD-4 dest-initiated DC `from` prefill. Operator may still change. */
export function preferPullFromSite(input: {
  allowSupply: boolean;
  allowKitchen: boolean;
  supplyOnHand: number;
  kitchenOnHand: number;
}): FulfillSiteKind | null {
  if (!input.allowSupply && !input.allowKitchen) return null;
  if (input.allowSupply && input.allowKitchen) {
    if (input.supplyOnHand > 0) return "central_supply";
    if (input.kitchenOnHand > 0) return "central_kitchen";
    return "central_supply";
  }
  if (input.allowSupply) return "central_supply";
  return "central_kitchen";
}
