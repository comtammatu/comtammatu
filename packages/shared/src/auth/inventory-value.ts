export type InventoryValueVisibility = {
  system: boolean;
  branch: boolean;
};

export function getInventoryValueVisibility(
  canReadValuation: boolean,
  isOwner: boolean,
): InventoryValueVisibility {
  return {
    system: canReadValuation && isOwner,
    branch: canReadValuation,
  };
}
