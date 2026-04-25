"use client";

import { registerBones } from "boneyard-js";
import { configureBoneyard } from "boneyard-js/react";

configureBoneyard({
  animate: "pulse",
  color: "var(--muted)",
  darkColor: "var(--muted)",
});

registerBones({});
