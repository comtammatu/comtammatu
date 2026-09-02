import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const actionsSource = readFileSync(
  join(import.meta.dirname, "../lib/staff-runtime/profile/actions.ts"),
  "utf8",
);
const pageSource = readFileSync(
  join(import.meta.dirname, "../lib/staff-runtime/profile/page.tsx"),
  "utf8",
);
const profileActionsSource = readFileSync(
  join(import.meta.dirname, "../lib/staff-runtime/profile/profile-actions.tsx"),
  "utf8",
);
const securityDialogSource = readFileSync(
  join(
    import.meta.dirname,
    "../lib/staff-runtime/profile/profile-security-dialog.tsx",
  ),
  "utf8",
);
const bankDialogSource = readFileSync(
  join(
    import.meta.dirname,
    "../lib/staff-runtime/profile/profile-bank-dialog.tsx",
  ),
  "utf8",
);
const preferencesSource = readFileSync(
  join(
    import.meta.dirname,
    "../lib/staff-runtime/profile/profile-preferences-section.tsx",
  ),
  "utf8",
);

test("profile actions expose changeMyPassword, updateMyBankInfo, and getMyBankInfo", () => {
  // Password change validation & auth
  assert.match(actionsSource, /export async function changeMyPassword/);
  assert.match(actionsSource, /changePasswordSchema\.safeParse/);
  assert.match(actionsSource, /min\(8/);
  assert.match(actionsSource, /auth\.admin\.updateUserById/);
  assert.match(actionsSource, /revalidateProfilePath/);

  // Bank info updates
  assert.match(actionsSource, /export async function updateMyBankInfo/);
  assert.match(actionsSource, /bankInfoSchema\.safeParse/);
  assert.match(actionsSource, /bank_account/);
  assert.match(actionsSource, /bank_name/);
  assert.match(actionsSource, /id_number/);
  assert.match(actionsSource, /profile_id.*userId/);

  // Fetch bank info
  assert.match(actionsSource, /export async function getMyBankInfo/);
});

test("profile-actions exports all actions with dynamic SSR disabled", () => {
  assert.match(profileActionsSource, /export function ProfileEditAction/);
  assert.match(profileActionsSource, /export function ProfileAvatarAction/);
  assert.match(profileActionsSource, /export function ProfileSecurityAction/);
  assert.match(profileActionsSource, /export function ProfileBankAction/);

  assert.match(profileActionsSource, /LazyProfileSecurityDialog = dynamic/);
  assert.match(profileActionsSource, /LazyProfileBankDialog = dynamic/);
  assert.match(profileActionsSource, /ssr: false/);
});

test("ProfileSecurityDialog enforces password confirmation match and min length", () => {
  assert.match(securityDialogSource, /name="newPassword"/);
  assert.match(securityDialogSource, /name="confirmPassword"/);
  assert.match(
    securityDialogSource,
    /data\.newPassword === data\.confirmPassword/,
  );
  assert.match(securityDialogSource, /changeMyPassword/);
});

test("ProfileBankDialog handles bank account, bank name, and CCCD/idNumber", () => {
  assert.match(bankDialogSource, /name="bankAccount"/);
  assert.match(bankDialogSource, /name="bankName"/);
  assert.match(bankDialogSource, /name="idNumber"/);
  assert.match(bankDialogSource, /updateMyBankInfo/);
  assert.match(bankDialogSource, /getMyBankInfo/);
});

test("ProfilePreferencesSection integrates sound alerts toggle and test audio", () => {
  assert.match(preferencesSource, /staff_sound_alerts_enabled/);
  assert.match(preferencesSource, /readDevicePref/);
  assert.match(preferencesSource, /writeDevicePref/);
  assert.match(preferencesSource, /playAppSignal/);
});

test("StaffProfilePageContent wires security, bank, and preferences on both planes", () => {
  // Imports
  assert.match(pageSource, /ProfileBankAction/);
  assert.match(pageSource, /ProfileSecurityAction/);
  assert.match(pageSource, /ProfilePreferencesSection/);

  // Branch plane has actions and preferences panel
  assert.match(pageSource, /<ProfileSecurityAction[\s\S]*branchId=/);
  assert.match(pageSource, /<ProfileBankAction[\s\S]*branchId=/);

  // Page preserves frozen test constraints
  assert.doesNotMatch(pageSource, /attendance_records/);
  assert.doesNotMatch(pageSource, /bank_account/);
  assert.doesNotMatch(pageSource, /start_date/);
});
