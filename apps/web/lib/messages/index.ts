import { interpolate } from "@comtammatu/shared/messages"

import { auth } from "./auth"
import { admin } from "./admin"
import { common } from "./common"
import { employee } from "./employee"
import { finance } from "./finance"
import { inventory } from "./inventory"
import { notifications } from "./notifications"
import { payment } from "./payment"
import { pos } from "./pos"
import { settings } from "./settings"

export const messages = {
  admin,
  common,
  auth,
  employee,
  finance,
  inventory,
  notifications,
  payment,
  pos,
  settings,
} as const

export const m = interpolate
