export type ThemeMode = "light" | "night";

type ThemeScriptOptions = {
  defaultTheme?: ThemeMode;
  storageKey?: string;
};

// Inline pre-hydration script. Resolves the theme before first paint to avoid
// FOUC. Priority: (1) `matu-theme` cookie override, (2) shift-aware fallback
// (night for 18:00–06:00 local hour), (3) default. Shift-aware is
// OS-preference-independent and timezone-stable (see design-system.md).
export function getThemeScriptHtml(options: ThemeScriptOptions = {}) {
  const storageKey = options.storageKey ?? "matu-theme";
  const defaultTheme: ThemeMode = options.defaultTheme ?? "light";

  return (
    `(function(){try{` +
    `var k=${JSON.stringify(storageKey)};` +
    `var c=document.cookie.match('(^|;)\\\\s*'+k+'\\\\s*=\\\\s*([^;]+)');` +
    `var cookie=c?decodeURIComponent(c.pop().split('=').pop()):'';` +
    `var t=cookie;` +
    `if(t!=='light'&&t!=='night'){` +
    `var h=new Date().getHours();` +
    `t=(h>=18||h<6)?'night':'light';` +
    `}` +
    `if(t!=='light'&&t!=='night'){t=${JSON.stringify(defaultTheme)};}` +
    `var cls=t==='night'?'dark':'light';` +
    `var d=document.documentElement;` +
    `d.classList.remove('light','dark');` +
    `d.classList.add(cls);` +
    `d.style.colorScheme=cls;` +
    `}catch(e){` +
    `var d=document.documentElement;` +
    `d.classList.remove('light','dark');` +
    `d.classList.add('light');` +
    `d.style.colorScheme='light';` +
    `}})();`
  );
}
