/** PostgREST/supabase-js default page is 1000 rows. Money totals must page. */
export const SUPABASE_PAGE_SIZE = 1000;

type PageResult<T> = {
  data: T[] | null;
  error: { code?: string } | null;
};

export async function fetchAllPagedRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = SUPABASE_PAGE_SIZE,
): Promise<PageResult<T>> {
  const size = Math.max(1, Math.floor(pageSize));
  const rows: T[] = [];

  for (let from = 0; ; from += size) {
    const { data, error } = await fetchPage(from, from + size - 1);
    if (error) return { data: null, error };

    const pageRows = data ?? [];
    rows.push(...pageRows);
    if (pageRows.length < size) return { data: rows, error: null };
  }
}
