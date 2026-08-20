import assert from "node:assert/strict";
import { test } from "node:test";
import {
  APP_SIGNAL_PATTERNS,
  getAppSignalDurationMs,
  VOICE_PLAYBACK_GAIN,
  VOICE_PLAYBACK_RATE,
} from "../lib/audio-signal";
import {
  audioModeHasBeep,
  audioModeHasVoice,
  buildAlertUtterance,
  cycleAudioMode,
  getKdsAudioModeKey,
  getPosAudioModeKey,
  KDS_VOICE_COOLDOWN_MS,
  KDS_TONE_TO_ALERT_KIND,
  OPERATIONAL_ALERT_TONES,
  resolveAudioMode,
  selectPosGuestAlert,
  shouldAnnouncePaymentReceived,
  shouldSpeakKdsVoice,
} from "../lib/operational-audio";
import {
  isAllowedOperationalUtterance,
  listCatalogUtterances,
  listPrefetchUtterances,
} from "../lib/operational-audio-catalog";

test("resolveAudioMode prefers the stored mode key", () => {
  assert.equal(resolveAudioMode("beep+voice"), "beep+voice");
  assert.equal(resolveAudioMode("voice"), "voice");
  assert.equal(resolveAudioMode("off"), "off");
});

test("resolveAudioMode ignores an unknown stored mode", () => {
  assert.equal(resolveAudioMode("loud"), "off");
  assert.equal(resolveAudioMode(null), "off");
});

test("cycleAudioMode walks off -> beep -> beep+voice", () => {
  assert.equal(cycleAudioMode("off"), "beep");
  assert.equal(cycleAudioMode("beep"), "beep+voice");
  assert.equal(cycleAudioMode("beep+voice"), "off");
  assert.equal(cycleAudioMode("voice"), "off");
});

test("audio mode channels", () => {
  assert.deepEqual(
    (["off", "beep", "voice", "beep+voice"] as const).map(audioModeHasBeep),
    [false, true, false, true],
  );
  assert.deepEqual(
    (["off", "beep", "voice", "beep+voice"] as const).map(audioModeHasVoice),
    [false, false, true, true],
  );
});

test("KDS voice enforces a quiet window between spoken alerts", () => {
  assert.equal(shouldSpeakKdsVoice(KDS_VOICE_COOLDOWN_MS - 1, 0), false);
  assert.equal(shouldSpeakKdsVoice(KDS_VOICE_COOLDOWN_MS, 0), true);
});

test("buildAlertUtterance appends the table slot only when present", () => {
  assert.equal(
    buildAlertUtterance("kds.new", { tableLabel: "5" }),
    "Phiếu mới bàn 5",
  );
  assert.equal(
    buildAlertUtterance("kds.append", { tableLabel: "12" }),
    "Gọi thêm bàn 12",
  );
  assert.equal(buildAlertUtterance("kds.add_on"), "Món thêm");
  assert.equal(
    buildAlertUtterance("kds.new", { tableLabel: "  " }),
    "Phiếu mới",
  );
  assert.equal(buildAlertUtterance("pos.self_order"), "Cần duyệt đơn");
  assert.equal(
    buildAlertUtterance("pos.self_order", { tableLabel: "7" }),
    "Bàn 7 cần duyệt đơn",
  );
  assert.equal(buildAlertUtterance("pos.payment_call"), "Gọi thanh toán");
  assert.equal(
    buildAlertUtterance("pos.payment_call", { tableLabel: "8" }),
    "Bàn 8 gọi thanh toán",
  );
  assert.equal(buildAlertUtterance("pos.staff_call"), "Gọi nhân viên");
  assert.equal(
    buildAlertUtterance("pos.staff_call", { tableLabel: "4" }),
    "Bàn 4 gọi nhân viên",
  );
  assert.equal(
    buildAlertUtterance("pos.payment_received", { amountVnd: 165_000 }),
    "Đã nhận một trăm sáu mươi lăm nghìn thanh toán",
  );
  assert.equal(
    buildAlertUtterance("pos.payment_received", {
      amountVnd: 165_000,
      tableLabel: "12",
    }),
    "Đã nhận một trăm sáu mươi lăm nghìn thanh toán bàn 12",
  );
  assert.equal(buildAlertUtterance("pos.payment_received"), "Đã thanh toán");
  assert.equal(buildAlertUtterance("pos.print_failed"), "In lỗi");
  assert.equal(buildAlertUtterance("pos.out_of_stock"), "Hết món");
});

test("KDS tones map onto the alert kind namespace", () => {
  assert.deepEqual(KDS_TONE_TO_ALERT_KIND, {
    "kds-new": "kds.new",
    "kds-append": "kds.append",
    "kds-add-on": "kds.add_on",
  });
});

test("device pref keys are branch scoped", () => {
  assert.equal(getKdsAudioModeKey(3), "kds:audio-mode:3");
  assert.equal(getPosAudioModeKey(3), "pos:audio-mode:3");
});

test("POS QR guest tones stay distinct from the POS order ping", () => {
  assert.notDeepEqual(
    APP_SIGNAL_PATTERNS.pos,
    APP_SIGNAL_PATTERNS["pos-self-order"],
  );
  assert.notDeepEqual(
    APP_SIGNAL_PATTERNS.pos,
    APP_SIGNAL_PATTERNS["pos-payment-call"],
  );
  assert.notDeepEqual(
    APP_SIGNAL_PATTERNS.pos,
    APP_SIGNAL_PATTERNS["pos-staff-call"],
  );
  assert.notDeepEqual(
    APP_SIGNAL_PATTERNS.pos,
    APP_SIGNAL_PATTERNS["pos-payment-received"],
  );
  assert.notDeepEqual(
    APP_SIGNAL_PATTERNS["pos-self-order"],
    APP_SIGNAL_PATTERNS["pos-payment-call"],
  );
  assert.notDeepEqual(
    APP_SIGNAL_PATTERNS["pos-payment-call"],
    APP_SIGNAL_PATTERNS["pos-staff-call"],
  );
  assert.notDeepEqual(
    APP_SIGNAL_PATTERNS["pos-payment-call"],
    APP_SIGNAL_PATTERNS["pos-payment-received"],
  );
});

test("POS guest and paid tones stay distinct from KDS ticket tones", () => {
  const kdsTones = ["kds", "kds-new", "kds-append", "kds-add-on"] as const;
  const posGuestTones = [
    "pos",
    "pos-self-order",
    "pos-payment-call",
    "pos-staff-call",
    "pos-payment-received",
  ] as const;
  for (const posTone of posGuestTones) {
    for (const kdsTone of kdsTones) {
      assert.notDeepEqual(
        APP_SIGNAL_PATTERNS[posTone],
        APP_SIGNAL_PATTERNS[kdsTone],
        `${posTone} must not reuse ${kdsTone}`,
      );
    }
  }
});

test("paid audio announces VietQR only, not cashier-confirmed cash", () => {
  assert.equal(shouldAnnouncePaymentReceived("vietqr"), true);
  assert.equal(shouldAnnouncePaymentReceived("cash"), false);
  assert.equal(shouldAnnouncePaymentReceived(null), false);
  assert.equal(shouldAnnouncePaymentReceived(undefined), false);
});

test("POS catalog kinds map onto distinct guest tones", () => {
  assert.equal(OPERATIONAL_ALERT_TONES["pos.self_order"], "pos-self-order");
  assert.equal(OPERATIONAL_ALERT_TONES["pos.payment_call"], "pos-payment-call");
  assert.equal(OPERATIONAL_ALERT_TONES["pos.staff_call"], "pos-staff-call");
  assert.equal(
    OPERATIONAL_ALERT_TONES["pos.payment_received"],
    "pos-payment-received",
  );
  assert.equal(OPERATIONAL_ALERT_TONES["pos.print_failed"], "pos");
  assert.equal(OPERATIONAL_ALERT_TONES["pos.out_of_stock"], "pos");
});

test("POS guest alerts coalesce to the highest-urgency kind", () => {
  assert.equal(selectPosGuestAlert([]), null);
  assert.deepEqual(
    selectPosGuestAlert([
      { kind: "pos.staff_call", tableLabel: "3" },
      { kind: "pos.self_order", tableLabel: "5" },
      { kind: "pos.payment_call", tableLabel: "8" },
    ]),
    { kind: "pos.payment_call", tableLabel: "8" },
  );
  assert.deepEqual(
    selectPosGuestAlert([
      { kind: "pos.staff_call", tableLabel: "3" },
      { kind: "pos.self_order", tableLabel: "5" },
    ]),
    { kind: "pos.self_order", tableLabel: "5" },
  );
});

test("signal duration includes every pulse and the gaps between them", () => {
  assert.equal(getAppSignalDurationMs("kds-new"), 1_020);
  assert.equal(getAppSignalDurationMs("kds-append"), 860);
  assert.equal(getAppSignalDurationMs("pos-payment-call"), 850);
  assert.equal(getAppSignalDurationMs("pos-staff-call"), 920);
  assert.equal(getAppSignalDurationMs("pos-payment-received"), 580);
});

test("cloud voice plays nova clips louder at recorded speed", () => {
  assert.equal(VOICE_PLAYBACK_GAIN, 6);
  assert.equal(VOICE_PLAYBACK_RATE, 1);
});

test("cloud TTS allowlist stores POS table lines and spoken amounts", () => {
  assert.equal(isAllowedOperationalUtterance("Bàn 7 cần duyệt đơn"), true);
  assert.equal(isAllowedOperationalUtterance("Bàn 8 gọi thanh toán"), true);
  assert.equal(isAllowedOperationalUtterance("Bàn 4 gọi nhân viên"), true);
  assert.equal(isAllowedOperationalUtterance("Bàn 12 gọi món"), true);
  assert.equal(isAllowedOperationalUtterance("Bàn 100 cần duyệt đơn"), true);
  assert.equal(
    isAllowedOperationalUtterance(
      "Đã nhận một trăm sáu mươi lăm nghìn thanh toán",
    ),
    true,
  );
  assert.equal(
    isAllowedOperationalUtterance(
      "Đã nhận một trăm sáu mươi lăm nghìn thanh toán bàn 12",
    ),
    true,
  );
  assert.equal(isAllowedOperationalUtterance("Read this bill please"), false);
  assert.equal(isAllowedOperationalUtterance("Bàn 1000 cần duyệt đơn"), false);
  assert.equal(
    isAllowedOperationalUtterance("Đã nhận một tỷ thanh toán"),
    false,
  );
  assert.ok(listCatalogUtterances().includes("Phiếu mới"));
  assert.ok(
    listPrefetchUtterances({
      surface: "pos",
      tableLabels: ["5", "5", "1000"],
    }).includes("Bàn 5 gọi nhân viên"),
  );
  assert.equal(
    listPrefetchUtterances({
      surface: "pos",
      tableLabels: ["5"],
    }).includes("Gọi nhân viên"),
    false,
  );
  assert.equal(
    listPrefetchUtterances({
      surface: "pos",
      tableLabels: ["5"],
    }).includes("Bàn 5 gọi món"),
    false,
  );
  assert.equal(
    listPrefetchUtterances({
      surface: "pos",
      tableLabels: ["5"],
    }).some((text) => text.startsWith("Đã nhận ")),
    false,
  );
});
