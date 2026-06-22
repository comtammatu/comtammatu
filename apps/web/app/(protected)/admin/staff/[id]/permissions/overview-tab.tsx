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
    ? messages.admin.staffPermissions.statusActive
    : messages.admin.staffPermissions.statusInactive;

  return (
    <AppSection title={messages.admin.staffPermissions.staffInfoTitle}>
      <DescriptionList
        className="sm:grid sm:grid-cols-2 sm:gap-3"
        items={[
          {
            term: messages.admin.staffPermissions.fieldFullName,
            description: fullName,
          },
          {
            term: messages.admin.staffPermissions.fieldPhone,
            description: (
              <span className="font-mono">{phone ?? "—"}</span>
            ),
          },
          {
            term: messages.admin.staffPermissions.fieldPosition,
            description: positionLabel,
          },
          {
            term: messages.admin.staffPermissions.fieldDefaultBranch,
            description: defaultBranchName,
          },
          {
            term: messages.admin.staffPermissions.fieldRole,
            description: (
              <span className="font-mono">
                {staffRoleFromPositionCode(positionCode)}
              </span>
            ),
          },
          {
            term: messages.admin.staffPermissions.fieldStatus,
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
