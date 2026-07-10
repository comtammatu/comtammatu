import assert from "node:assert/strict";
import { test } from "node:test";
import { APP_SIGNAL_PATTERNS } from "../lib/audio-signal";
import {
  audioModeHasBeep,
  audioModeHasVoice,
  buildAlertUtterance,
  cycleAudioMode,
  getKdsAudioModeKey,
  getKdsSoundPrefKey,
  KDS_TONE_TO_ALERT_KIND,
  resolveAudioMode,
} from "../lib/operational-audio";

test("resolveAudioMode prefers the stored mode key", () => {
  assert.equal(resolveAudioMode("beep+voice", "1"), "beep+voice");
  assert.equal(resolveAudioMode("voice", null), "voice");
  assert.equal(resolveAudioMode("off", "1"), "off");
});

test("resolveAudioMode maps the boolean sound pref", () => {
  assert.equal(resolveAudioMode(null, "1"), "beep");
  assert.equal(resolveAudioMode(null, "0"), "off");
  assert.equal(resolveAudioMode(null, null), "off");
});

test("resolveAudioMode ignores an unknown stored mode", () => {
  assert.equal(resolveAudioMode("loud", "1"), "beep");
  assert.equal(resolveAudioMode("loud", null), "off");
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

test("buildAlertUtterance appends the table slot only when present", () => {
  assert.equal(buildAlertUtterance("kds.new", "5"), "Phiếu mới bàn 5");
  assert.equal(buildAlertUtterance("kds.append", "12"), "Gọi thêm bàn 12");
  assert.equal(buildAlertUtterance("kds.add_on"), "Món thêm");
  assert.equal(buildAlertUtterance("kds.new", "  "), "Phiếu mới");
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
  assert.equal(getKdsSoundPrefKey(3), "kds:sound:3");
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
