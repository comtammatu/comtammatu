import { notFound } from "next/navigation";
import {
  Armchair as IconArmchair,
  ChefHat as IconChefHat,
  Monitor as IconDeviceDesktop,
  Printer as IconPrinter,
  ReceiptText as IconReceiptText,
  SlidersHorizontal as IconSlidersHorizontal,
} from "lucide-react";
import { canAccess } from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import {
  AppEmptyState,
  AppLinkCard,
  AppPage,
  AppSection,
  LinkCardGrid,
} from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchSwitcherOptions } from "@/_lib/branch-scope";
import { messages } from "@lib/messages";
import { BranchManagementShell } from "../_components/branch-management-chrome";
import { AttendanceSettingsCard } from "./attendance-settings-card";
import { buildHubTiles } from "./_lib/hub-tiles";

export default async function BranchSettingsHubPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: branchIdStr } = await params;
  const branchId = Number(branchIdStr);
  if (!Number.isInteger(branchId) || branchId <= 0) {
    notFound();
  }

  const { supabase, claims, session } = await loadAuthState();

  const { data: branch } = await supabase
    .from("branches")
    .select("id, name, branch_kind, is_active")
    .eq("id", branchId)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (!branch || !branch.is_active) notFound();

  const branchOptions = await resolveBranchSwitcherOptions(supabase, claims);

  const copy = messages.settings.branch;
  const role = claims.user_role;

  const tiles = buildHubTiles(branchId, copy, {
    tables: <IconArmchair />,
    pos: <IconDeviceDesktop />,
    printers: <IconPrinter />,
    kds: <IconChefHat />,
    posSessions: <IconReceiptText />,
    menuLimits: <IconSlidersHorizontal />,
  });
  const visibleTiles = tiles.filter((tile) => canAccess(role, tile.moduleKey));
  // Attendance config links into /hr; gate it so roles without HR access do not
  // land on a dead-end tile (mirrors the dashboard per-tile ACL pattern).
  const showAttendance = canAccess(role, "hr");
  const hasContent = visibleTiles.length > 0 || showAttendance;

  const displayName =
    session.user.user_metadata?.["full_name"] ??
    session.user.email ??
    claims.user_role;

  return (
    <BranchManagementShell
      user={{ name: displayName }}
      role={role}
      branchId={branchId}
      branchName={branch.name}
      branchOptions={branchOptions}
      defaultPageTitle={copy.hubTitle}
      description={copy.hubDescription(branch.name)}
      breadcrumbSegments={[
        { label: APP_COPY_VI.branchCommand, href: `/br/${branchId}/dashboard` },
        copy.hubTitle,
      ]}
    >
      <AppPage width="wide">
        {hasContent ? (
          <>
            <AppSection
              title={copy.setupLaneTitle}
              description={copy.setupLaneDescription}
            >
              {visibleTiles.length > 0 ? (
                <LinkCardGrid>
                  {visibleTiles.map((tile) => (
                    <AppLinkCard
                      key={`${tile.moduleKey}-${tile.href}`}
                      href={tile.href}
                      title={tile.title}
                      description={tile.description}
                      icon={tile.icon}
                      ctaLabel={copy.openAction}
                    />
                  ))}
                </LinkCardGrid>
              ) : (
                <AppEmptyState
                  mode="no-access"
                  title={copy.hubEmptyTitle}
                  description={copy.hubEmptyDescription}
                />
              )}
            </AppSection>
            {showAttendance ? (
              <AppSection
                title={copy.attendanceChecklistTitle}
                description={copy.attendanceChecklistDescription}
              >
                <AttendanceSettingsCard
                  branch={{ id: branch.id, name: branch.name }}
                />
              </AppSection>
            ) : null}
          </>
        ) : (
          <AppEmptyState
            mode="no-access"
            title={copy.hubEmptyTitle}
            description={copy.hubEmptyDescription}
          />
        )}
      </AppPage>
    </BranchManagementShell>
  );
}
