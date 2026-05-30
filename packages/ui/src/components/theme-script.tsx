import type { Theme } from "./theme-provider";

type ThemeScriptOptions = {
  defaultTheme?: Theme;
  forcedTheme?: "light" | "dark";
  storageKey?: string;
};

export function getThemeScriptHtml({
  defaultTheme = "system",
  forcedTheme,
  storageKey = "theme",
}: ThemeScriptOptions = {}) {
  if (forcedTheme) {
    return (
      `(function(){try{` +
      `var d=document.documentElement;` +
      `var t=${JSON.stringify(forcedTheme)};` +
      `d.classList.remove("light","dark");` +
      `d.classList.add(t);` +
      `d.style.colorScheme=t;` +
      `}catch(e){}})();`
    );
  }

  return (
    `(function(){try{` +
    `var d=document.documentElement;` +
    `var s=localStorage.getItem(${JSON.stringify(storageKey)});` +
    `var t=(s==="light"||s==="dark"||s==="system")?s:${JSON.stringify(defaultTheme)};` +
    `if(t==="system"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}` +
    `d.classList.remove("light","dark");` +
    `d.classList.add(t);` +
    `d.style.colorScheme=t;` +
    `}catch(e){}})();`
  );
}
