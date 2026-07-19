import { Badge } from "@comtammatu/ui/components/badge";
import { staffRoleFromPositionCode } from "@comtammatu/shared/auth";
import { messages } from "@lib/messages";
import { AppSection, DescriptionList } from "@/components/surface";

type OverviewTabProps = {
  fullName: string;
  phone: string | null;
  positionLabel: string;
  defaultBranchName: string;
  positionCode: string | null | undefined;
  isActive: boolean;
};

export function OverviewTab({
  fullName,
  phone,
  positionLabel,
  defaultBranchName,
  positionCode,
  isActive,
}: OverviewTabProps) {
  const statusLabel = isActive
    ? messages.owner.staffPermissions.statusActive
    : messages.owner.staffPermissions.statusInactive;

  return (
    <AppSection title={messages.owner.staffPermissions.staffInfoTitle}>
      <DescriptionList
        className="sm:grid sm:grid-cols-2 sm:gap-3"
        items={[
          {
            term: messages.owner.staffPermissions.fieldFullName,
            description: fullName,
          },
          {
            term: messages.owner.staffPermissions.fieldPhone,
            description: (
              <span className="font-mono">{phone ?? "—"}</span>
            ),
          },
          {
            term: messages.owner.staffPermissions.fieldPosition,
            description: positionLabel,
          },
          {
            term: messages.owner.staffPermissions.fieldDefaultBranch,
            description: defaultBranchName,
          },
          {
            term: messages.owner.staffPermissions.fieldRole,
            description: (
              <span className="font-mono">
                {staffRoleFromPositionCode(positionCode)}
              </span>
            ),
          },
          {
            term: messages.owner.staffPermissions.fieldStatus,
            description: (
              <Badge variant={isActive ? "success" : "secondary"}>
                {statusLabel}
              </Badge>
            ),
          },
        ]}
      />
    </AppSection>
  );
}
