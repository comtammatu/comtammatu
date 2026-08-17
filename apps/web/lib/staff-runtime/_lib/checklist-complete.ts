export type ChecklistCompleteItem = {
  isRequired: boolean;
  done: boolean;
  allowsPhoto: boolean;
  photoPath: string | null;
};

/** Matches self_service_request_checkout: required photo tasks need photo_path. */
export function isRequiredChecklistItemComplete(
  item: ChecklistCompleteItem,
): boolean {
  if (!item.isRequired) return true;
  if (!item.done) return false;
  if (!item.allowsPhoto) return true;
  return Boolean(item.photoPath?.trim());
}
