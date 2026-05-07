import type { Theme } from "./theme-provider";

type ThemeScriptProps = {
  defaultTheme?: Theme;
  storageKey?: string;
};

export function ThemeScript({
  defaultTheme = "system",
  storageKey = "theme",
}: ThemeScriptProps = {}) {
  const html =
    `(function(){try{` +
    `var d=document.documentElement;` +
    `var s=localStorage.getItem(${JSON.stringify(storageKey)});` +
    `var t=(s==="light"||s==="dark"||s==="system")?s:${JSON.stringify(defaultTheme)};` +
    `if(t==="system"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}` +
    `d.classList.remove("light","dark");` +
    `d.classList.add(t);` +
    `d.style.colorScheme=t;` +
    `}catch(e){}})();`;
  return (
    <script
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
