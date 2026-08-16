import { z } from "zod";

export const BRANCH_CODE_PATTERN = /^[A-Z]{2,4}$/;

export const branchCodeSchema = z
  .string()
  .trim()
  .regex(BRANCH_CODE_PATTERN, {
    error: "Mã chi nhánh gồm 2–4 chữ cái in hoa",
  });
