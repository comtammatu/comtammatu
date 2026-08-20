import { connection } from "next/server";

/** Request-time clock. `new Date()` during prerender fails Cache Components. */
export async function requestNow(): Promise<Date> {
  await connection();
  return new Date();
}

export async function requestNowMs(): Promise<number> {
  return (await requestNow()).getTime();
}
