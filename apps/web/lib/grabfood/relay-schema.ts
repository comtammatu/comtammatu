import { z } from "zod";

function optionalProviderValue<T extends z.ZodType>(schema: T) {
  return schema.nullish().transform((value) => value ?? undefined);
}

const optionalProviderString = (maxLength: number) =>
  optionalProviderValue(z.string().max(maxLength));
const optionalProviderMoney = optionalProviderValue(z.number().nonnegative());

const grabItemDiscountSchema = z
  .object({
    discountType: optionalProviderString(100),
    itemDiscountPriceDisplay: optionalProviderString(50),
    itemDiscountPriceFloat: optionalProviderMoney,
    itemDiscountPriceInMin: optionalProviderMoney,
    discountAmountDisplay: optionalProviderString(50),
    discountAmountFloat: optionalProviderMoney,
  })
  .strip();

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
          discountInfo: optionalProviderValue(grabItemDiscountSchema),
        })
        .strip(),
    ),
    discountInfo: optionalProviderValue(grabItemDiscountSchema),
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
    branch_id: z.coerce.number().int().positive().optional(),
    merchant_id: z.string().max(100).optional(),
    order: grabOrderPayloadSchema.optional(),
  })
  .strict();

export function summarizeGrabRelayValidationIssues(error: z.ZodError) {
  return error.issues.slice(0, 20).map((issue) => ({
    path: issue.path.map(String).join("."),
    code: issue.code,
  }));
}
