import Link from "next/link";
import { ItemGroup } from "@comtammatu/ui/components/item";
import { OperationalBoardCard } from "@/components/surface";
import { BranchActionItem } from "../../../_components/branch-action-item";
import type {
  BranchCommandTile,
  BranchReadinessItem,
  CockpitCard,
  CockpitLane,
  CockpitLaneTone,
} from "../_lib/command-config";

const COCKPIT_TONE_CLASS: Record<CockpitLaneTone, string> = {
  success: "border-success/20 bg-success/10",
  warning: "border-warning/20 bg-warning/10",
  info: "border-info/20 bg-info/10",
  secondary: "border-border bg-muted/30",
};

function CockpitCardView({ card }: { card: CockpitCard }) {
  const body = (
    <div className="flex w-full items-center gap-3 px-3 py-3">
      <span aria-hidden="true" className="text-muted-foreground">
        {card.icon}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium leading-tight text-foreground">
          {card.title}
        </span>
        {card.description ? (
          <span className="text-xs leading-tight text-muted-foreground">
            {card.description}
          </span>
        ) : null}
      </div>
    </div>
  );
  return (
    <OperationalBoardCard
      className={`${COCKPIT_TONE_CLASS[card.tone]} min-w-0`}
      interactive={!!card.href}
    >
      {card.href ? (
        <Link href={card.href} className="block rounded-lg">
          {body}
        </Link>
      ) : (
        body
      )}
    </OperationalBoardCard>
  );
}

export function CockpitLanes({ lanes }: { lanes: CockpitLane[] }) {
  const nonEmpty = lanes.filter((lane) => lane.cards.length > 0);
  if (nonEmpty.length === 0) return null;

  const totalCards = nonEmpty.reduce((sum, lane) => sum + lane.cards.length, 0);
  // When the cockpit holds few cards, a 3-lane grid just stacks one card
  // under each header on mobile. Collapse to a single dense list instead.
  if (totalCards <= 3) {
    return (
      <div className="flex flex-col gap-2">
        {nonEmpty.map((lane) =>
          lane.cards.map((card) => (
            <CockpitCardView key={card.key} card={card} />
          )),
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {nonEmpty.map((lane) => (
        <section key={lane.id} className="flex min-w-0 flex-col gap-2">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {lane.title}
          </h3>
          <div className="flex min-w-0 flex-col gap-2">
            {lane.cards.map((card) => (
              <CockpitCardView key={card.key} card={card} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function BranchCommandTileGrid({
  tiles,
  ctaLabel,
}: {
  tiles: BranchCommandTile[];
  ctaLabel: string;
}) {
  return (
    <ItemGroup className="gap-2">
      {tiles.map((tile) => (
        <BranchActionItem
          key={`${tile.moduleKey}-${tile.href}`}
          href={tile.href}
          title={tile.title}
          description={tile.description}
          icon={tile.icon}
          ctaLabel={ctaLabel}
          iconTone="muted"
        />
      ))}
    </ItemGroup>
  );
}

export function BranchReadinessList({
  items,
}: {
  items: BranchReadinessItem[];
}) {
  // Keep long readiness lists from swallowing the first viewport; they stay
  // fully scrollable, not truncated.
  const tall = items.length > 4;
  return (
    <ItemGroup
      className={tall ? "max-h-96 gap-2 overflow-y-auto overscroll-contain" : "gap-2"}
    >
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
