import type { Theme } from "./theme-provider";

type ThemeScriptOptions = {
  defaultTheme?: Theme;
  forcedTheme?: "light" | "dark";
  storageKey?: string;
};

export function getThemeScriptHtml(_options: ThemeScriptOptions = {}) {
  const theme = "light";

  return (
    `(function(){try{` +
    `var d=document.documentElement;` +
    `var t=${JSON.stringify(theme)};` +
    `d.classList.remove("light","dark");` +
    `d.classList.add(t);` +
    `d.style.colorScheme=t;` +
    `}catch(e){}})();`
  );
}
