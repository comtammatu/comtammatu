import { interpolate } from "@comtammatu/shared/messages"

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

export const m = interpolate
