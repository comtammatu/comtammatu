import { auth } from "./auth"
import { common } from "./common"
import { inventory } from "./inventory"
import { notifications } from "./notifications"
import { pos } from "./pos"

export const messages = {
  common,
  auth,
  inventory,
  notifications,
  pos,
} as const

/**
 * Interpolate `{placeholder}` tokens in a message template.
 * Unknown keys are preserved as-is to make the miss visible in UI.
 */
export function m(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const val = vars[key]
    return val === undefined ? `{${key}}` : String(val)
  })
}
