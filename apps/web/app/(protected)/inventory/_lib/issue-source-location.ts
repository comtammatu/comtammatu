export type IssueSourceLocationCandidate = {
  id: number;
  is_default_issue: boolean;
  is_default_consumption: boolean;
};

export type IssueSourceLocationSelection =
  | { ok: true; locationId: number }
  | {
      ok: false;
      reason: "location_not_configured" | "location_ambiguous";
    };

export function selectIssueSourceLocation(
  locations: readonly IssueSourceLocationCandidate[],
): IssueSourceLocationSelection {
  if (locations.length === 0) {
    return { ok: false, reason: "location_not_configured" };
  }
  if (locations.length === 1 && locations[0]) {
    return { ok: true, locationId: locations[0].id };
  }

  const consumptionDefaults = locations.filter(
    (location) => location.is_default_consumption,
  );
  if (consumptionDefaults.length === 1 && consumptionDefaults[0]) {
    return { ok: true, locationId: consumptionDefaults[0].id };
  }

  const issueDefaults = locations.filter((location) => location.is_default_issue);
  if (issueDefaults.length === 1 && issueDefaults[0]) {
    return { ok: true, locationId: issueDefaults[0].id };
  }

  return { ok: false, reason: "location_ambiguous" };
}
