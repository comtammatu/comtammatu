export const PWA_LAUNCHER_APPS = [
  "cong",
  "pos",
  "kds",
  "pickup",
  "me",
] as const;

export type PwaLauncherApp = (typeof PWA_LAUNCHER_APPS)[number];

export function buildPwaLauncherIcons(app: PwaLauncherApp) {
  return [
    {
      src: `/icons/icon-${app}-any-192.png`,
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: `/icons/icon-${app}-any-512.png`,
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
    {
      src: `/icons/icon-${app}-maskable-512.png`,
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ] as const;
}
