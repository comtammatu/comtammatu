import { interpolate } from "@comtammatu/shared/messages";

import { auth } from "./auth";
import { controlSurface } from "./control-surface";
import { catalog } from "./catalog";
import { common } from "./common";
import { employee } from "./employee";
import { finance } from "./finance";
import { feedbackCopy } from "./feedback";
import { hr } from "./hr";
import { inventory } from "./inventory";
import {
  CATEGORIES_VI,
  INGREDIENT_FORM_VI,
  UNITS_VI,
} from "./inventory-master";
import { notifications } from "./notifications";
import { orders } from "./orders";
import { operator } from "./operator";
import { pos } from "./pos";
import { settings } from "./settings";
import { workCopy } from "./work";

export const messages = {
  controlSurface,
  catalog,
  common,
  auth,
  employee,
  finance,
  feedback: feedbackCopy,
  hr,
  inventory,
  inventoryMaster: {
    units: UNITS_VI,
    categories: CATEGORIES_VI,
    ingredientForm: INGREDIENT_FORM_VI,
  },
  notifications,
  orders,
  operator,
  pos,
  settings,
  work: workCopy,
} as const;

export const m = interpolate;
