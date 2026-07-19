import assert from "node:assert/strict";
import { test } from "node:test";
import {
  APP_SIGNAL_PATTERNS,
  getAppSignalDurationMs,
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
  resolveAudioMode,
  shouldSpeakKdsVoice,
} from "../lib/operational-audio";

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
  assert.equal(buildAlertUtterance("kds.new", "5"), "Phiếu mới bàn 5");
  assert.equal(buildAlertUtterance("kds.append", "12"), "Gọi thêm bàn 12");
  assert.equal(buildAlertUtterance("kds.add_on"), "Món thêm");
  assert.equal(buildAlertUtterance("kds.new", "  "), "Phiếu mới");
  assert.equal(buildAlertUtterance("pos.self_order"), "Khách tự gọi");
  assert.equal(
    buildAlertUtterance("pos.payment_received", "21"),
    "Bàn 21 đã thanh toán",
  );
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
    APP_SIGNAL_PATTERNS["pos-self-order"],
    APP_SIGNAL_PATTERNS["pos-payment-call"],
  );
});

test("signal duration includes every pulse and the gaps between them", () => {
  assert.equal(getAppSignalDurationMs("kds-new"), 1_020);
  assert.equal(getAppSignalDurationMs("kds-append"), 860);
  assert.equal(getAppSignalDurationMs("pos-payment-call"), 850);
});
