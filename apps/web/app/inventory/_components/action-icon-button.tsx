import type { ReactNode } from "react";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";

export function ActionIconButton({
  icon,
  label,
  onClick,
  className,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      disabled={disabled}
      onClick={onClick}
      className={cn(className)}
      aria-label={label}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </Button>
  );
}
