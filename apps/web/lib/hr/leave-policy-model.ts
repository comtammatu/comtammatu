import { z } from "zod";

export const hrLeavePolicySchema = z.object({
  standardWorkdays: z.coerce.number().min(1).max(31),
  monthlyLeaveDays: z.coerce.number().min(0).max(31),
});

export type HrLeavePolicy = z.infer<typeof hrLeavePolicySchema>;
