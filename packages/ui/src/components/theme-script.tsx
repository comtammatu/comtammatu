import {
  NIGHT_SHIFT_END_HOUR,
  NIGHT_SHIFT_START_HOUR,
  THEME_COOKIE_NAME,
  type ThemeMode,
} from "../lib/theme-cookie";

export type { ThemeMode };

type ThemeScriptOptions = {
  defaultTheme?: ThemeMode;
  storageKey?: string;
  /**
   * Background hex per mode. The server can only emit the cookie-resolved
   * `themeColor`, so without this the browser chrome stays light while the
   * shift-aware fallback paints night. Passing it lets the script correct the
   * `<meta name="theme-color">` before first paint.
   */
  chromeColors?: Record<ThemeMode, string>;
};

// Inline pre-hydration script. Resolves the theme before first paint to avoid
// FOUC. Priority: (1) theme cookie override, (2) shift-aware fallback
// (night for 18:00–06:00 local hour), (3) default. Shift-aware is
// OS-preference-independent and timezone-stable (see design-system.md).
export function getThemeScriptHtml(options: ThemeScriptOptions = {}) {
  const storageKey = options.storageKey ?? THEME_COOKIE_NAME;
  const defaultTheme: ThemeMode = options.defaultTheme ?? "light";
  const chromeColors = options.chromeColors;

  return (
    `(function(){try{` +
    `var k=${JSON.stringify(storageKey)};` +
    `var c=document.cookie.match('(^|;)\\\\s*'+k+'\\\\s*=\\\\s*([^;]+)');` +
    `var cookie=c?decodeURIComponent(c.pop().split('=').pop()):'';` +
    `var t=cookie;` +
    `if(t!=='light'&&t!=='night'){` +
    `var h=new Date().getHours();` +
    `t=(h>=${NIGHT_SHIFT_START_HOUR}||h<${NIGHT_SHIFT_END_HOUR})?'night':'light';` +
    `}` +
    `if(t!=='light'&&t!=='night'){t=${JSON.stringify(defaultTheme)};}` +
    `var cls=t==='night'?'dark':'light';` +
    `var d=document.documentElement;` +
    `d.classList.remove('light','dark');` +
    `d.classList.add(cls);` +
    `d.style.colorScheme=cls;` +
    (chromeColors
      ? `var colors=${JSON.stringify(chromeColors)};` +
        `var m=document.querySelector('meta[name="theme-color"]');` +
        `if(m){m.setAttribute('content',colors[t]);}`
      : "") +
    `}catch(e){` +
    `var d=document.documentElement;` +
    `d.classList.remove('light','dark');` +
    `d.classList.add('light');` +
    `d.style.colorScheme='light';` +
    `}})();`
  );
}
