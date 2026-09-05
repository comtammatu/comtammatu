import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { PROMOTIONS_VI } from "@comtammatu/shared/messages";

const webRoot = process.cwd();

function readWeb(path: string): string {
  return readFileSync(resolve(webRoot, path), "utf8");
}

test("PromotionStepper component exists and defines 4 standard campaign steps", () => {
  const stepperPath = "app/(protected)/promotions/_components/promotion-stepper.tsx";
  assert.ok(existsSync(resolve(webRoot, stepperPath)), "PromotionStepper file must exist");

  const stepperContent = readWeb(stepperPath);
  assert.match(stepperContent, /export function PromotionStepper\(/);
  assert.match(stepperContent, /PROMOTION_FORM_STEPS/);
  assert.match(stepperContent, /stepIdentity/);
  assert.match(stepperContent, /stepBenefit/);
  assert.match(stepperContent, /stepSchedule/);
  assert.match(stepperContent, /stepCodes/);
  assert.match(stepperContent, /canNavigateToStep/);
});

test("PromotionForm integrates 4-step wizard with view mode switcher and DOM retention", () => {
  const formContent = readWeb("app/(protected)/promotions/promotion-form.tsx");

  // State
  assert.match(formContent, /const \[currentStep, setCurrentStep\] = useState<1 \| 2 \| 3 \| 4>\(1\)/);
  assert.match(formContent, /const \[viewMode, setViewMode\] = useState<"wizard" \| "full">\("wizard"\)/);

  // Stepper & Mode Switcher UI
  assert.match(formContent, /<PromotionStepper/);
  assert.match(formContent, /<AppSegmentedControl/);
  assert.match(formContent, /value:\s*"wizard",\s*label:\s*PROMOTIONS_VI\.viewWizard/);
  assert.match(formContent, /value:\s*"full",\s*label:\s*PROMOTIONS_VI\.viewFull/);

  // Step navigation handlers with Zod trigger validation
  assert.match(formContent, /async function handleNextStep\(\)/);
  assert.match(formContent, /form\.trigger\(\["name", "kind", "status"\]\)/);
  assert.match(formContent, /function handlePrevStep\(\)/);
  assert.match(formContent, /async function handleSelectStep\(step: number\)/);

  // CSS hidden strategy ensures all form controls stay mounted in DOM
  assert.match(formContent, /viewMode === "wizard" && currentStep !== 1\s*\?\s*"hidden"\s*:\s*"flex flex-col gap-4"/);
  assert.match(formContent, /viewMode === "wizard" && currentStep !== 2\s*\?\s*"hidden"\s*:\s*"flex flex-col gap-4"/);
  assert.match(formContent, /viewMode === "wizard" && currentStep !== 3\s*\?\s*"hidden"\s*:\s*"flex flex-col gap-4"/);
  assert.match(formContent, /viewMode === "wizard" && currentStep !== 4\s*\?\s*"hidden"\s*:\s*"flex flex-col gap-4"/);

  // Step 4 summary section & outer codes container
  assert.match(formContent, /PROMOTIONS_VI\.stepSummary/);
  assert.match(formContent, /<PromotionRuleSummary/);
  assert.match(formContent, /liveMockup/);
});

test("Vietnamese copy keys for promotion wizard workflow exist and are valid", () => {
  assert.strictEqual(PROMOTIONS_VI.stepIdentity, "1. Thông tin & Loại ưu đãi");
  assert.strictEqual(PROMOTIONS_VI.stepBenefit, "2. Mức ưu đãi & Món");
  assert.strictEqual(PROMOTIONS_VI.stepSchedule, "3. Thời gian & Phạm vi");
  assert.strictEqual(PROMOTIONS_VI.stepCodes, "4. Mã voucher & Quản lý");
  assert.strictEqual(PROMOTIONS_VI.prevStep, "Quay lại");
  assert.strictEqual(PROMOTIONS_VI.nextStep, "Tiếp tục");
  assert.strictEqual(PROMOTIONS_VI.stepSummary, "Tóm tắt chiến dịch");
  assert.strictEqual(PROMOTIONS_VI.viewWizard, "Từng bước");
  assert.strictEqual(PROMOTIONS_VI.viewFull, "Toàn bộ");
  assert.strictEqual(PROMOTIONS_VI.stepOf, "trên");
});
