import type { ReactNode } from "react";
import { AppPageHeader } from "./surface";

interface PageHeroProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHero({
  eyebrow,
  title,
  description,
  actions,
  className,
}: PageHeroProps) {
  return (
    <AppPageHeader
      headingLevel="h2"
      eyebrow={eyebrow}
      title={title}
      description={description}
      actions={actions}
      className={className}
      titleClassName="truncate text-xl sm:text-xl"
    />
  );
}
