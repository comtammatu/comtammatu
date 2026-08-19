import {
  buildReceivedAmountUtterance,
  OPERATIONAL_SPEECH_VND_MAX,
  OPERATIONAL_SPEECH_VND_STEP,
} from "./vnd-vietnamese-speech";

export type OperationalAlertKind =
  | "kds.new"
  | "kds.append"
  | "kds.add_on"
  | "pos.self_order"
  | "pos.payment_call"
  | "pos.staff_call"
  | "pos.payment_received"
  | "pos.print_failed"
  | "pos.out_of_stock";

export type PosGuestAlertKind = Extract<
  OperationalAlertKind,
  "pos.self_order" | "pos.payment_call" | "pos.staff_call"
>;

export interface PosGuestAlertCandidate {
  kind: PosGuestAlertKind;
  tableLabel?: string | undefined;
}

export interface OperationalAlertSlots {
  tableLabel?: string | undefined;
  amountVnd?: number | undefined;
}

export const OPERATIONAL_ALERT_KINDS: readonly OperationalAlertKind[] = [
  "kds.new",
  "kds.append",
  "kds.add_on",
  "pos.self_order",
  "pos.payment_call",
  "pos.staff_call",
  "pos.payment_received",
  "pos.print_failed",
  "pos.out_of_stock",
];

export const OPERATIONAL_TTS_MAX_TABLE = 999;
export const OPERATIONAL_TTS_PREFETCH_TABLE_LIMIT = 40;

/** Finite POS table lines persisted on the device. `gọi món` is stored for later wiring. */
export const POS_STORED_TABLE_TAILS = [
  "gọi món",
  "cần duyệt đơn",
  "gọi thanh toán",
  "gọi nhân viên",
] as const;

const ALERT_PHRASES: Record<OperationalAlertKind, string> = {
  "kds.new": "Phiếu mới",
  "kds.append": "Gọi thêm",
  "kds.add_on": "Món thêm",
  "pos.self_order": "Cần duyệt đơn",
  "pos.payment_call": "Gọi thanh toán",
  "pos.staff_call": "Gọi nhân viên",
  "pos.payment_received": "Đã thanh toán",
  "pos.print_failed": "In lỗi",
  "pos.out_of_stock": "Hết món",
};

const POS_TABLE_EVENT_TAIL = {
  "pos.self_order": "cần duyệt đơn",
  "pos.payment_call": "gọi thanh toán",
  "pos.staff_call": "gọi nhân viên",
} as const satisfies Partial<
  Record<OperationalAlertKind, (typeof POS_STORED_TABLE_TAILS)[number]>
>;

const POS_GUEST_ALERT_PRIORITY: Record<PosGuestAlertKind, number> = {
  "pos.staff_call": 0,
  "pos.self_order": 1,
  "pos.payment_call": 2,
};

const TABLE_LABEL_RE = /^[1-9][0-9]{0,2}$/;
const RECEIVED_AMOUNT_PREFIX = "Đã nhận ";

export function isAllowedTableLabel(label: string): boolean {
  if (!TABLE_LABEL_RE.test(label)) return false;
  const table = Number(label);
  return table >= 1 && table <= OPERATIONAL_TTS_MAX_TABLE;
}

export function buildPosTableUtterance(
  tableLabel: string,
  tail: (typeof POS_STORED_TABLE_TAILS)[number],
): string {
  return `Bàn ${tableLabel} ${tail}`;
}

export function buildAlertUtterance(
  kind: OperationalAlertKind,
  slots?: OperationalAlertSlots,
): string {
  if (kind === "pos.payment_received") {
    if (slots?.amountVnd !== undefined) {
      return (
        buildReceivedAmountUtterance(slots.amountVnd) ?? ALERT_PHRASES[kind]
      );
    }
    return ALERT_PHRASES[kind];
  }

  const table = slots?.tableLabel?.trim();
  const tail =
    kind === "pos.self_order" ||
    kind === "pos.payment_call" ||
    kind === "pos.staff_call"
      ? POS_TABLE_EVENT_TAIL[kind]
      : undefined;
  if (tail && table && isAllowedTableLabel(table)) {
    return buildPosTableUtterance(table, tail);
  }
  if (kind.startsWith("kds.") && table && isAllowedTableLabel(table)) {
    return `${ALERT_PHRASES[kind]} bàn ${table}`;
  }
  return ALERT_PHRASES[kind];
}

export function selectPosGuestAlert(
  candidates: readonly PosGuestAlertCandidate[],
): PosGuestAlertCandidate | null {
  let winner: PosGuestAlertCandidate | null = null;
  for (const candidate of candidates) {
    if (
      winner === null ||
      POS_GUEST_ALERT_PRIORITY[candidate.kind] >
        POS_GUEST_ALERT_PRIORITY[winner.kind]
    ) {
      winner = candidate;
    }
  }
  return winner;
}

export function listCatalogUtterances(): string[] {
  return OPERATIONAL_ALERT_KINDS.map((kind) => buildAlertUtterance(kind));
}

export function listPrefetchUtterances(options?: {
  tableLabels?: readonly string[] | undefined;
  surface?: "pos" | "kds" | undefined;
}): string[] {
  const surface = options?.surface;
  const kinds = OPERATIONAL_ALERT_KINDS.filter((kind) => {
    if (surface === "pos") return kind.startsWith("pos.");
    if (surface === "kds") return kind.startsWith("kds.");
    return true;
  });
  const texts: string[] = kinds.map((kind) => buildAlertUtterance(kind));
  const tables: string[] = [];
  const seen = new Set<string>();
  for (const raw of options?.tableLabels ?? []) {
    const table = raw.trim();
    if (!isAllowedTableLabel(table) || seen.has(table)) continue;
    seen.add(table);
    tables.push(table);
    if (tables.length >= OPERATIONAL_TTS_PREFETCH_TABLE_LIMIT) break;
  }
  for (const table of tables) {
    if (surface !== "kds") {
      for (const tail of POS_STORED_TABLE_TAILS) {
        texts.push(buildPosTableUtterance(table, tail));
      }
    }
    if (surface !== "pos") {
      for (const kind of OPERATIONAL_ALERT_KINDS) {
        if (!kind.startsWith("kds.")) continue;
        texts.push(buildAlertUtterance(kind, { tableLabel: table }));
      }
    }
  }
  return [...new Set(texts)];
}

const GENERIC_UTTERANCES = new Set(listCatalogUtterances());

let receivedAmountUtterances: ReadonlySet<string> | null = null;

function getReceivedAmountUtterances(): ReadonlySet<string> {
  if (receivedAmountUtterances) return receivedAmountUtterances;
  const allowed = new Set<string>();
  for (
    let amount = OPERATIONAL_SPEECH_VND_STEP;
    amount <= OPERATIONAL_SPEECH_VND_MAX;
    amount += OPERATIONAL_SPEECH_VND_STEP
  ) {
    const spoken = buildReceivedAmountUtterance(amount);
    if (spoken) allowed.add(spoken);
  }
  receivedAmountUtterances = allowed;
  return allowed;
}

function isAllowedReceivedAmountUtterance(text: string): boolean {
  if (!text.startsWith(RECEIVED_AMOUNT_PREFIX) || text.length > 96) {
    return false;
  }
  return getReceivedAmountUtterances().has(text);
}

export function isAllowedOperationalUtterance(text: string): boolean {
  if (GENERIC_UTTERANCES.has(text)) return true;
  if (isAllowedReceivedAmountUtterance(text)) return true;
  for (const tail of POS_STORED_TABLE_TAILS) {
    const prefix = "Bàn ";
    const suffix = ` ${tail}`;
    if (!text.startsWith(prefix) || !text.endsWith(suffix)) continue;
    const label = text.slice(prefix.length, text.length - suffix.length);
    if (isAllowedTableLabel(label)) return true;
  }
  for (const kind of OPERATIONAL_ALERT_KINDS) {
    if (!kind.startsWith("kds.")) continue;
    const prefix = `${ALERT_PHRASES[kind]} bàn `;
    if (!text.startsWith(prefix)) continue;
    if (isAllowedTableLabel(text.slice(prefix.length))) return true;
  }
  return false;
}
