import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { ChevronDown as IconChevronDown } from "lucide-react";
import { NavigationMenu as NavigationMenuPrimitive } from "radix-ui";

import { cn } from "../lib/utils";

const navigationMenuSizeClasses = {
  sm: "text-xs",
  default: "text-sm",
  touch: "text-sm",
};

const navigationMenuContentWidthClasses = {
  auto: "",
  panel: "min-w-64",
  wide: "min-w-80",
};

const navigationMenuTriggerStyle = cva(
  "group/navigation-menu-trigger inline-flex w-max items-center justify-center rounded-md font-medium whitespace-nowrap transition-all outline-none select-none hover:bg-muted focus:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-popup-open:bg-muted/50 data-popup-open:hover:bg-muted data-open:bg-muted/50 data-open:hover:bg-muted data-open:focus:bg-muted",
  {
    variants: {
      size: {
        sm: "h-8 gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        default:
          "h-10 gap-1.5 px-3 text-sm [&_svg:not([class*='size-'])]:size-3.5",
        touch:
          "min-h-11 gap-1.5 px-4 text-sm [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

const navigationMenuLinkStyle = cva(
  "flex items-center gap-1.5 rounded-md transition-all outline-none hover:bg-muted focus:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-1 data-[active=true]:bg-muted/50 data-[active=true]:hover:bg-muted data-[active=true]:focus:bg-muted [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      size: {
        sm: "min-h-8 p-2 text-xs/relaxed [&_svg:not([class*='size-'])]:size-3.5",
        default:
          "min-h-9 p-2.5 text-sm/relaxed [&_svg:not([class*='size-'])]:size-4",
        touch:
          "min-h-11 p-3 text-sm/relaxed [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

type NavigationMenuSize = keyof typeof navigationMenuSizeClasses;
type NavigationMenuContentWidth =
  keyof typeof navigationMenuContentWidthClasses;

const NavigationMenuSizeContext =
  React.createContext<NavigationMenuSize>("default");

function NavigationMenu({
  className,
  children,
  viewport = true,
  size = "default",
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Root> & {
  viewport?: boolean;
  size?: NavigationMenuSize;
}) {
  return (
    <NavigationMenuSizeContext.Provider value={size}>
      <NavigationMenuPrimitive.Root
        data-slot="navigation-menu"
        data-viewport={viewport}
        data-size={size}
        className={cn(
          "group/navigation-menu relative flex max-w-max flex-1 items-center justify-center",
          navigationMenuSizeClasses[size],
          className,
        )}
        {...props}
      >
        {children}
        {viewport && <NavigationMenuViewport />}
      </NavigationMenuPrimitive.Root>
    </NavigationMenuSizeContext.Provider>
  );
}

function NavigationMenuList({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.List>) {
  return (
    <NavigationMenuPrimitive.List
      data-slot="navigation-menu-list"
      className={cn(
        "group flex flex-1 list-none items-center justify-center gap-0",
        className,
      )}
      {...props}
    />
  );
}

function NavigationMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Item>) {
  return (
    <NavigationMenuPrimitive.Item
      data-slot="navigation-menu-item"
      className={cn("relative", className)}
      {...props}
    />
  );
}

function NavigationMenuTrigger({
  className,
  children,
  size,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Trigger> &
  VariantProps<typeof navigationMenuTriggerStyle>) {
  const contextSize = React.useContext(NavigationMenuSizeContext);
  const resolvedSize = size ?? contextSize;

  return (
    <NavigationMenuPrimitive.Trigger
      data-slot="navigation-menu-trigger"
      data-size={resolvedSize}
      className={cn(
        navigationMenuTriggerStyle({ size: resolvedSize }),
        "group",
        className,
      )}
      {...props}
    >
      {children}{" "}
      <IconChevronDown
        className="relative top-px transition duration-300 group-data-popup-open/navigation-menu-trigger:rotate-180 group-data-open/navigation-menu-trigger:rotate-180"
        aria-hidden="true"
      />
    </NavigationMenuPrimitive.Trigger>
  );
}

function NavigationMenuContent({
  className,
  width = "auto",
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Content> & {
  width?: NavigationMenuContentWidth;
}) {
  return (
    <NavigationMenuPrimitive.Content
      data-slot="navigation-menu-content"
      data-width={width}
      className={cn(
        "top-0 left-0 w-full p-1.5 ease-[cubic-bezier(0.22,1,0.36,1)] group-data-[viewport=false]/navigation-menu:top-full group-data-[viewport=false]/navigation-menu:mt-1.5 group-data-[viewport=false]/navigation-menu:overflow-hidden group-data-[viewport=false]/navigation-menu:rounded-lg group-data-[viewport=false]/navigation-menu:bg-popover group-data-[viewport=false]/navigation-menu:text-popover-foreground group-data-[viewport=false]/navigation-menu:shadow-md group-data-[viewport=false]/navigation-menu:ring-1 group-data-[viewport=false]/navigation-menu:ring-foreground/10 group-data-[viewport=false]/navigation-menu:duration-300 data-[motion=from-end]:slide-in-from-right-52 data-[motion=from-start]:slide-in-from-left-52 data-[motion=to-end]:slide-out-to-right-52 data-[motion=to-start]:slide-out-to-left-52 data-[motion^=from-]:animate-in data-[motion^=from-]:fade-in data-[motion^=to-]:animate-out data-[motion^=to-]:fade-out **:data-[slot=navigation-menu-link]:focus:ring-0 **:data-[slot=navigation-menu-link]:focus:outline-none md:absolute md:w-auto group-data-[viewport=false]/navigation-menu:data-open:animate-in group-data-[viewport=false]/navigation-menu:data-open:fade-in-0 group-data-[viewport=false]/navigation-menu:data-open:zoom-in-95 group-data-[viewport=false]/navigation-menu:data-closed:animate-out group-data-[viewport=false]/navigation-menu:data-closed:fade-out-0 group-data-[viewport=false]/navigation-menu:data-closed:zoom-out-95",
        navigationMenuContentWidthClasses[width],
        className,
      )}
      {...props}
    />
  );
}

function NavigationMenuViewport({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Viewport>) {
  return (
    <div className="absolute top-full left-0 isolate z-50 flex justify-center">
      <NavigationMenuPrimitive.Viewport
        data-slot="navigation-menu-viewport"
        className={cn(
          "origin-top-center relative mt-1.5 h-(--radix-navigation-menu-viewport-height) w-full overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 md:w-(--radix-navigation-menu-viewport-width) data-open:animate-in data-open:zoom-in-90 data-closed:animate-out data-closed:zoom-out-90",
          className,
        )}
        {...props}
      />
    </div>
  );
}

function NavigationMenuLink({
  className,
  size,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Link> &
  VariantProps<typeof navigationMenuLinkStyle>) {
  const contextSize = React.useContext(NavigationMenuSizeContext);
  const resolvedSize = size ?? contextSize;

  return (
    <NavigationMenuPrimitive.Link
      data-slot="navigation-menu-link"
      data-size={resolvedSize}
      className={cn(navigationMenuLinkStyle({ size: resolvedSize }), className)}
      {...props}
    />
  );
}

function NavigationMenuIndicator({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Indicator>) {
  return (
    <NavigationMenuPrimitive.Indicator
      data-slot="navigation-menu-indicator"
      className={cn(
        "top-full z-1 flex h-1.5 items-end justify-center overflow-hidden data-[state=hidden]:animate-out data-[state=hidden]:fade-out data-[state=visible]:animate-in data-[state=visible]:fade-in",
        className,
      )}
      {...props}
    >
      <div className="relative top-[60%] h-2 w-2 rotate-45 rounded-tl-sm bg-border shadow-md" />
    </NavigationMenuPrimitive.Indicator>
  );
}

export {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuContent,
  NavigationMenuTrigger,
  NavigationMenuLink,
  NavigationMenuIndicator,
  NavigationMenuViewport,
  navigationMenuTriggerStyle,
};
