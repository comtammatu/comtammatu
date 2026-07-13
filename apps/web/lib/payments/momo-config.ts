import { normalizeMomoGatewayBaseUrl } from "./momo-url";

const MOMO_TEST_BASE_URL = "https://test-payment.momo.vn";

export type MomoConfig = {
  partnerCode: string;
  accessKey: string;
  secretKey: string;
  baseUrl: string;
};

type MomoConfigEnvironment = {
  NODE_ENV?: string;
  MOMO_ENABLED?: string;
  MOMO_RUNTIME_READY?: string;
  MOMO_PARTNER_CODE?: string;
  MOMO_ACCESS_KEY?: string;
  MOMO_SECRET_KEY?: string;
  MOMO_BASE_URL?: string;
};

export function isMomoEnabled(env: MomoConfigEnvironment): boolean {
  return env.MOMO_ENABLED?.trim().toLowerCase() === "true";
}

export function isMomoRuntimeReady(env: MomoConfigEnvironment): boolean {
  return env.MOMO_RUNTIME_READY?.trim().toLowerCase() === "true";
}

export function isMomoCheckoutAvailable(env: MomoConfigEnvironment): boolean {
  if (!isMomoEnabled(env) || !isMomoRuntimeReady(env)) return false;
  try {
    loadMomoConfig(env);
    return true;
  } catch {
    return false;
  }
}

export class MomoConfigurationError extends Error {
  constructor() {
    super("momo_configuration_invalid");
  }
}

export function loadMomoConfig(env: MomoConfigEnvironment): MomoConfig {
  const partnerCode = env.MOMO_PARTNER_CODE?.trim();
  const accessKey = env.MOMO_ACCESS_KEY?.trim();
  const secretKey = env.MOMO_SECRET_KEY?.trim();
  const configuredBaseUrl = env.MOMO_BASE_URL?.trim();
  const baseUrl =
    configuredBaseUrl ||
    (env.NODE_ENV === "production" ? null : MOMO_TEST_BASE_URL);
  const normalizedBaseUrl = normalizeMomoGatewayBaseUrl(baseUrl);

  if (!partnerCode || !accessKey || !secretKey || !normalizedBaseUrl) {
    throw new MomoConfigurationError();
  }

  return {
    partnerCode,
    accessKey,
    secretKey,
    baseUrl: normalizedBaseUrl,
  };
}
