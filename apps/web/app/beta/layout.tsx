import type { ReactNode } from "react";
import {
  Cormorant_Garamond,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
} from "next/font/google";

const betaSans = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-beta-sans",
  display: "swap",
});

const betaDisplay = Cormorant_Garamond({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["500", "600", "700"],
  variable: "--font-beta-display",
  display: "swap",
});

const betaMono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-beta-mono",
  display: "swap",
});

export default function BetaLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${betaSans.variable} ${betaDisplay.variable} ${betaMono.variable}`}>
      {children}
    </div>
  );
}
