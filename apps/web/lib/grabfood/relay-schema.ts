import { z } from "zod";

export const MIN_GRAB_RELAY_VERSION = "1.1.8";

function parseRelayVersion(value: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
  if (!match) return null;

  const parts = match.slice(1).map(Number);
  const major = parts[0];
  const minor = parts[1];
  const patch = parts[2];
  if (major === undefined || minor === undefined || patch === undefined) {
    return null;
  }
  return [major, minor, patch];
}

export function isGrabRelayVersionSupported(
  value: string | undefined,
): boolean {
  if (!value) return false;
  const current = parseRelayVersion(value);
  const minimum = parseRelayVersion(MIN_GRAB_RELAY_VERSION);
  if (!current || !minimum) return false;

  for (let index = 0; index < current.length; index += 1) {
    const currentPart = current[index];
    const minimumPart = minimum[index];
    if (currentPart === undefined || minimumPart === undefined) return false;
    if (currentPart > minimumPart) return true;
    if (currentPart < minimumPart) return false;
  }
  return true;
}

function optionalProviderValue<T extends z.ZodType>(schema: T) {
  return schema.nullish().transform((value) => value ?? undefined);
}

const optionalProviderString = (maxLength: number) =>
  optionalProviderValue(z.string().max(maxLength));
const optionalProviderMoney = optionalProviderValue(z.number().nonnegative());

const grabItemDiscountSchema = z
  .object({
    discountName: optionalProviderString(200),
    discountType: optionalProviderString(100),
    itemDiscountPriceDisplay: optionalProviderString(50),
    itemDiscountPriceFloat: optionalProviderMoney,
    itemDiscountPriceInMin: optionalProviderMoney,
    discountAmountDisplay: optionalProviderString(50),
    discountAmountFloat: optionalProviderMoney,
  })
  .strip();

const grabItemDiscountsSchema = z.preprocess(
  (value) => {
    if (value == null) return undefined;
    return Array.isArray(value) ? value : [value];
  },
  z.array(grabItemDiscountSchema).max(20).optional(),
);

const grabModifierSchema = z
  .object({
    modifierID: optionalProviderString(100),
    modifierName: optionalProviderString(200),
    priceDisplay: optionalProviderString(50),
    quantity: optionalProviderValue(z.number().int().positive()),
  })
  .strip();

const grabModifierGroupSchema = z
  .object({
    modifierGroupID: optionalProviderString(100),
    modifierGroupName: optionalProviderString(200),
    modifiers: optionalProviderValue(z.array(grabModifierSchema).max(50)),
  })
  .strip();

const grabOrderItemSchema = z
  .object({
    itemID: optionalProviderString(100),
    name: z.string().min(1).max(200),
    quantity: z.number().int().positive().default(1),
    comment: z.string().max(500).nullable().optional(),
    fare: optionalProviderValue(
      z
        .object({
          priceDisplay: optionalProviderString(50),
          originalItemPriceDisplay: optionalProviderString(50),
          priceFloat: optionalProviderMoney,
          priceInMin: optionalProviderMoney,
          discountInfo: grabItemDiscountsSchema,
        })
        .strip(),
    ),
    discountInfo: grabItemDiscountsSchema,
    modifierGroups: optionalProviderValue(
      z.array(grabModifierGroupSchema).max(20),
    ),
  })
  .strip();

const grabOrderDiscountSchema = z
  .object({
    discountType: optionalProviderString(100),
    discountAmountDisplay: optionalProviderString(50),
    discountAmountFloat: optionalProviderMoney,
    description: optionalProviderString(200),
    code: optionalProviderString(100),
    itemID: optionalProviderString(100),
  })
  .strip();

const grabOrderPayloadSchema = z
  .object({
    orderID: z.string().min(1).max(100),
    displayID: z.string().min(1).max(50),
    orderState: optionalProviderString(50),
    state: optionalProviderString(50),
    status: optionalProviderString(50),
    merchant: optionalProviderValue(
      z
        .object({
          ID: optionalProviderString(100),
        })
        .strip(),
    ),
    itemInfo: z
      .object({
        items: z.array(grabOrderItemSchema).min(1).max(100),
      })
      .strip(),
    fare: optionalProviderValue(
      z
        .object({
          subTotalDisplay: optionalProviderString(50),
          totalDisplay: optionalProviderString(50),
          discountDisplay: optionalProviderString(50),
          orderLevelDiscounts: optionalProviderValue(
            z.array(grabOrderDiscountSchema).max(20),
          ),
        })
        .strip(),
    ),
    orderLevelDiscounts: optionalProviderValue(
      z.array(grabOrderDiscountSchema).max(20),
    ),
    promotions: optionalProviderValue(z.array(grabOrderDiscountSchema).max(20)),
    paymentMethod: optionalProviderString(50),
    cutlery: optionalProviderValue(z.number().int()),
  })
  .strip();

export const grabRelaySchema = z
  .object({
    ping: z.boolean().optional(),
    relay_version: optionalProviderString(20),
    branch_id: z.coerce.number().int().positive().optional(),
    merchant_id: z.string().max(100).optional(),
    order: grabOrderPayloadSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.ping !== true && value.branch_id === undefined) {
      context.addIssue({
        code: "custom",
        path: ["branch_id"],
        message: "branch_id is required for order relay",
      });
    }
  });

export function summarizeGrabRelayValidationIssues(error: z.ZodError) {
  return error.issues.slice(0, 20).map((issue) => ({
    path: issue.path.map(String).join("."),
    code: issue.code,
  }));
}
