"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  CircleCheck as IconCircleCheck,
  Info as IconInfoCircle,
  OctagonAlert as IconAlertOctagon,
  TriangleAlert as IconAlertTriangle,
} from "lucide-react";
import { Spinner } from "./spinner";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: <IconCircleCheck className="size-4" />,
        info: <IconInfoCircle className="size-4" />,
        warning: <IconAlertTriangle className="size-4" />,
        error: <IconAlertOctagon className="size-4" />,
        loading: <Spinner />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
export type { ToasterProps };
export { toast } from "sonner";
