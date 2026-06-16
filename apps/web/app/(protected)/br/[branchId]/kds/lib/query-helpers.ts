import type { KdsTicket } from "../types";

const KDS_QUERY_CHUNK_SIZE = 200;
const KDS_TICKET_PAGE_SIZE = 500;

export interface KdsRowsResult<T> {
  data: T[] | null;
  error: unknown | null;
}

export function uniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values)].filter((id) => Number.isFinite(id));
}

export function chunkNumbers(
  values: readonly number[],
  chunkSize = KDS_QUERY_CHUNK_SIZE,
): number[][] {
  const ids = uniqueNumbers(values);
  if (ids.length === 0) return [];

  const size = Math.max(1, Math.floor(chunkSize));
  const chunks: number[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }
  return chunks;
}

export function dedupeRowsById<T extends { id: number }>(
  rows: readonly T[],
): T[] {
  const byId = new Map<number, T>();
  for (const row of rows) {
    byId.set(row.id, row);
  }
  return [...byId.values()];
}

export function sortKdsTicketsNewestFirst(
  tickets: readonly KdsTicket[],
): KdsTicket[] {
  return [...tickets].sort((a, b) => {
    const timeDelta =
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (timeDelta !== 0) return timeDelta;
    return b.id - a.id;
  });
}

export async function fetchPagedRows<T>(
  fetchPage: (from: number, to: number) => Promise<KdsRowsResult<T>>,
  pageSize = KDS_TICKET_PAGE_SIZE,
): Promise<KdsRowsResult<T>> {
  const size = Math.max(1, Math.floor(pageSize));
  const rows: T[] = [];

  for (let from = 0; ; from += size) {
    const to = from + size - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) return { data: null, error };

    const pageRows = data ?? [];
    rows.push(...pageRows);
    if (pageRows.length < size) break;
  }

  return { data: rows, error: null };
}

export async function fetchChunkedRows<T>(
  ids: readonly number[],
  fetchChunk: (chunkIds: number[]) => Promise<KdsRowsResult<T>>,
  chunkSize = KDS_QUERY_CHUNK_SIZE,
): Promise<KdsRowsResult<T>> {
  const rows: T[] = [];

  for (const chunkIds of chunkNumbers(ids, chunkSize)) {
    const { data, error } = await fetchChunk(chunkIds);
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
  }

  return { data: rows, error: null };
}
