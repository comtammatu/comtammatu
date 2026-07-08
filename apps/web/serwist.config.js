// @ts-check
import { serwist } from "@serwist/next/config";

const excludedPrecachePrefixes = ["public/brand/mascot/", "/brand/mascot/"];

export default serwist({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  manifestTransforms: [
    (entries) => ({
      manifest: entries.filter(
        ({ url }) =>
          !excludedPrecachePrefixes.some((prefix) => url.startsWith(prefix)),
      ),
      warnings: [],
    }),
  ],
});
