import { LinkCardGrid, AppLinkCard } from "@/components/surface";
import { ItemGroup } from "@comtammatu/ui/components/item";
import { BranchActionItem } from "../../_components/branch-action-item";
import type {
  BranchCommandTile,
  BranchReadinessItem,
} from "../_lib/command-config";

export function BranchCommandTileGrid({
  tiles,
  ctaLabel,
}: {
  tiles: BranchCommandTile[];
  ctaLabel: string;
}) {
  return (
    <LinkCardGrid>
      {tiles.map((tile) => (
        <AppLinkCard
          key={`${tile.moduleKey}-${tile.href}`}
          href={tile.href}
          title={tile.title}
          description={tile.description}
          icon={tile.icon}
          ctaLabel={ctaLabel}
        />
      ))}
    </LinkCardGrid>
  );
}

export function BranchReadinessList({
  items,
}: {
  items: BranchReadinessItem[];
}) {
  return (
    <ItemGroup className="gap-2">
      {items.map((item) => (
        <BranchActionItem
          key={item.key}
          icon={item.icon}
          title={item.title}
          description={item.description}
          href={item.href}
          ctaLabel={item.ctaLabel}
          iconTone="muted"
          badge={{ children: item.badge, variant: item.badgeVariant }}
        />
      ))}
    </ItemGroup>
  );
}
