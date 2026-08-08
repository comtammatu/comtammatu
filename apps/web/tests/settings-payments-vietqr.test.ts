import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  findVietQrBank,
  parseVietQrBanks,
  transferCapableBanks,
} from "../lib/vietqr/banks";

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("VietQR banks parser keeps transfer-capable banks with code and bin", () => {
  const parsed = parseVietQrBanks({
    code: "00",
    data: [
      {
        code: "TCB",
        bin: "970407",
        name: "Techcombank",
        shortName: "Techcombank",
        transferSupported: 1,
        lookupSupported: 1,
      },
      {
        code: "MAFC",
        bin: "977777",
        name: "MAFC",
        shortName: "MAFC",
        transferSupported: 0,
        lookupSupported: 0,
      },
    ],
  });

  assert.equal(parsed.kind, "ok");
  if (parsed.kind !== "ok") return;

  const transferBanks = transferCapableBanks(parsed.banks);
  assert.equal(transferBanks.length, 1);
  assert.equal(transferBanks[0]?.code, "TCB");
  assert.equal(findVietQrBank(parsed.banks, "970407")?.code, "TCB");
  assert.equal(findVietQrBank(parsed.banks, "tcb")?.bin, "970407");
});

test("VietQR banks parser rejects invalid envelopes", () => {
  assert.deepEqual(parseVietQrBanks({ code: "99", data: [] }), {
    kind: "invalid",
  });
  assert.deepEqual(parseVietQrBanks({ code: "00", data: null }), {
    kind: "invalid",
  });
});

test("settings payments form is manual payee entry without account lookup", () => {
  const form = readWeb(
    "app/(protected)/settings/(tenant)/payments/payments-form.tsx",
  );
  const actions = readWeb(
    "app/(protected)/settings/(tenant)/payments/actions.ts",
  );
  const page = readWeb("app/(protected)/settings/(tenant)/payments/page.tsx");
  const banksServer = readWeb("lib/vietqr/banks-server.ts");

  assert.doesNotMatch(form, /from "@comtammatu\/ui\/components\/tabs"/);
  assert.doesNotMatch(form, /connectionTab|editTab/);
  assert.doesNotMatch(form, /lookupVietQrAccount|Tra cứu|lookupAction/);
  assert.doesNotMatch(form, /account-lookup/);
  assert.match(form, /ComboboxField/);
  assert.match(form, /Collapsible/);
  assert.match(form, /!form\.formState\.isDirty/);
  assert.match(form, /form\.reset\(values\)/);
  assert.match(form, /enableVietqr \?/);

  assert.doesNotMatch(actions, /lookupVietQrAccount|rateLimit|resolveBankBin/);
  assert.match(actions, /updatePaymentSettings/);
  assert.match(actions, /Promise\.all/);

  assert.match(page, /fetchVietQrBanks/);
  assert.doesNotMatch(page, /accountLookup|account-lookup/);
  assert.match(banksServer, /https:\/\/api\.vietqr\.io\/v2\/banks/);
  assert.match(banksServer, /revalidate: 86_400/);

  assert.doesNotMatch(form, /https:\/\/api\.vietqr\.io\/v2\/lookup/);
  assert.doesNotMatch(actions, /https:\/\/api\.vietqr\.io\/v2\/lookup/);
});
