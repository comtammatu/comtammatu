// @ts-check
import { serwist } from "@serwist/next/config";

const excludedPrecachePrefixes = ["public/brand/mascot/", "/brand/mascot/"];

export default serwist({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  manifestTransforms: [
    (entries) => ({
      manifest: [
        ...entries.filter(
          ({ url }) =>
            url !== "/offline" &&
            !excludedPrecachePrefixes.some((prefix) => url.startsWith(prefix)),
        ),
        {
          url: "/offline",
          size: 0,
          revision:
            entries.find(({ url }) => url.endsWith("/_buildManifest.js"))
              ?.url ?? null,
        },
      ],
      warnings: [],
    }),
  ],
});
