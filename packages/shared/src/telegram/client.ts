/**
 * Telegram Bot API client. Reads TELEGRAM_BOT_TOKEN from env at call site.
 * NEVER include the token in error messages or thrown errors.
 */
const TELEGRAM_API_BASE = "https://api.telegram.org";

export type TelegramSendOptions = {
  parse_mode?: "MarkdownV2" | "HTML";
  disable_web_page_preview?: boolean;
};

export type TelegramSendResult =
  | { ok: true; message_id: number }
  | { ok: false; status: number; description: string; retry_after?: number };

/**
 * Strip the bot token from any string (urls, error messages, etc.) before logging.
 * WHY: tokens appear in Telegram API URLs — never let them leak into logs.
 */
export function redactTelegramToken(input: string, botToken: string): string {
  if (!botToken) return input;
  return input.split(botToken).join("***REDACTED***");
}

export async function sendTelegramMessage(args: {
  botToken: string;
  chatId: string;
  text: string;
  options?: TelegramSendOptions;
}): Promise<TelegramSendResult> {
  const url = `${TELEGRAM_API_BASE}/bot${args.botToken}/sendMessage`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: args.chatId,
        text: args.text,
        parse_mode: args.options?.parse_mode ?? "MarkdownV2",
        disable_web_page_preview:
          args.options?.disable_web_page_preview ?? true,
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "network_error";
    return {
      ok: false,
      status: 0,
      description: redactTelegramToken(msg, args.botToken),
    };
  }
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    const description =
      body && typeof body === "object" && "description" in body
        ? String((body as Record<string, unknown>).description ?? "")
        : `http_${res.status}`;
    const retryAfter =
      body && typeof body === "object" && "parameters" in body
        ? (body as { parameters?: { retry_after?: number } }).parameters
            ?.retry_after
        : undefined;
    return {
      ok: false,
      status: res.status,
      description: redactTelegramToken(description, args.botToken),
      retry_after: retryAfter,
    };
  }
  const json = (await res.json()) as {
    ok: boolean;
    result?: { message_id: number };
  };
  if (json.ok && json.result?.message_id) {
    return { ok: true, message_id: json.result.message_id };
  }
  return { ok: false, status: 0, description: "malformed_response" };
}
