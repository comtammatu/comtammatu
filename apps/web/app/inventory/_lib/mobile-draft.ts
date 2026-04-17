"use client";

export type GrnDraftLine = {
  ingredientId: number;
  ingredientName: string;
  unit: string;
  quantity: number;
  unitCost: number;
  note?: string;
};

export type GrnDraft = {
  draftId: string;
  supplierId: number;
  supplierName: string;
  branchId: number | null;
  lines: GrnDraftLine[];
  updatedAt: string;
};

const STORAGE_PREFIX = "inv-grn-draft";

function storageKey(userKey: string, draftId: string): string {
  return `${STORAGE_PREFIX}:${userKey}:${draftId}`;
}

function indexKey(userKey: string): string {
  return `${STORAGE_PREFIX}:${userKey}:index`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function createEmptyDraft(
  supplierId: number,
  supplierName: string,
  branchId: number | null,
): GrnDraft {
  return {
    draftId: `grn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    supplierId,
    supplierName,
    branchId,
    lines: [],
    updatedAt: nowIso(),
  };
}

export function loadDraft(userKey: string, draftId: string): GrnDraft | null {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(storageKey(userKey, draftId));
    if (!raw) return null;
    return JSON.parse(raw) as GrnDraft;
  } catch {
    return null;
  }
}

export function saveDraft(userKey: string, draft: GrnDraft): void {
  const storage = safeStorage();
  if (!storage) return;
  const record: GrnDraft = { ...draft, updatedAt: nowIso() };
  try {
    storage.setItem(storageKey(userKey, draft.draftId), JSON.stringify(record));
    const index = readIndex(userKey);
    if (!index.includes(draft.draftId)) {
      index.unshift(draft.draftId);
      storage.setItem(indexKey(userKey), JSON.stringify(index));
    }
  } catch {
    /* ignore quota errors */
  }
}

export function removeDraft(userKey: string, draftId: string): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(storageKey(userKey, draftId));
    const index = readIndex(userKey).filter((id) => id !== draftId);
    storage.setItem(indexKey(userKey), JSON.stringify(index));
  } catch {
    /* ignore */
  }
}

export function listDrafts(userKey: string): GrnDraft[] {
  const storage = safeStorage();
  if (!storage) return [];
  const ids = readIndex(userKey);
  const drafts: GrnDraft[] = [];
  for (const id of ids) {
    const draft = loadDraft(userKey, id);
    if (draft) drafts.push(draft);
  }
  return drafts.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

function readIndex(userKey: string): string[] {
  const storage = safeStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(indexKey(userKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

export function draftTotal(draft: GrnDraft | null): number {
  if (!draft) return 0;
  return draft.lines.reduce(
    (sum, line) => sum + line.quantity * line.unitCost,
    0,
  );
}
