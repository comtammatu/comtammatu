import { interpolate } from "@comtammatu/shared/messages";

import { auth } from "./auth";
import { admin } from "./admin";
import { common } from "./common";
import { employee } from "./employee";
import { finance } from "./finance";
import { hr } from "./hr";
import { inventory } from "./inventory";
import {
  CATEGORIES_VI,
  INGREDIENT_FORM_VI,
  UNITS_VI,
} from "./inventory-master";
import { notifications } from "./notifications";
import { operator } from "./operator";
import { pos } from "./pos";
import { settings } from "./settings";

export const messages = {
  admin,
  common,
  auth,
  employee,
  finance,
  hr,
  inventory,
  inventoryMaster: {
    units: UNITS_VI,
    categories: CATEGORIES_VI,
    ingredientForm: INGREDIENT_FORM_VI,
  },
  notifications,
  operator,
  pos,
  settings,
} as const;

export const m = interpolate;
