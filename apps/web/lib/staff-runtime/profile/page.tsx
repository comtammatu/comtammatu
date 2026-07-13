import {
  CalendarDays as IconBirthDate,
  FileText as IconPayslip,
  LogOut as IconLogout,
  Mail as IconMail,
  Phone as IconPhone,
} from "lucide-react";
import Link from "next/link";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@comtammatu/ui/components/avatar";
import { Button } from "@comtammatu/ui/components/button";
import { loadAuthState } from "@/_lib/auth";
import {
  BranchOperatorActionBar,
  BranchOperatorDetailList,
  BranchOperatorPage,
} from "@lib/branch-operator/components/branch-operator-page";
import { messages } from "@lib/messages";
import {
  EmployeeActionBar,
  EmployeePage,
  EmployeePanel,
} from "../components/staff-runtime-page";
import { getEmployeeContext } from "../_lib/staff-runtime-context";
import { ProfileAvatarAction, ProfileEditAction } from "./profile-actions";

const employeeCopy = messages.employee;
const copy = employeeCopy.profile;

type ProfilePlane = "employee" | "branch";

type StaffProfilePageContentProps = {
  plane?: ProfilePlane;
  branchId?: number;
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatBirthDate(value: string | null): string | null {
  if (!value) return null;
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day} / ${month} / ${year}`;
}

export async function StaffProfilePageContent({
  plane = "employee",
  branchId,
}: StaffProfilePageContentProps = {}) {
  const { user, claims, supabase } = await loadAuthState();
  const ctx = await getEmployeeContext();
  const positionCode = claims.position ?? claims.position_code ?? null;
  const effectiveBranchId = ctx?.branchId ?? claims.branch_id ?? null;

  const [profileResult, employeeResult, positionResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, phone, avatar_url, birth_date")
      .eq("id", user.id)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle(),
    ctx
      ? supabase
          .from("employees")
          .select("employee_code")
          .eq("id", ctx.employeeId)
          .eq("tenant_id", claims.tenant_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    positionCode
      ? supabase
          .from("positions")
          .select("label_vi")
          .eq("tenant_id", claims.tenant_id)
          .eq("code", positionCode)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const profile = profileResult.data;
  const employee = employeeResult.data;
  const positionLabel =
    positionResult.data?.label_vi ?? positionCode ?? claims.user_role;
  const displayName =
    profile?.full_name ??
    user.fullName ??
    user.email ??
    copy.fallbackName;
  const phone = profile?.phone ?? null;
  const birthDate = profile?.birth_date ?? null;
  const avatarUrl = profile?.avatar_url ?? "";
  const email = user.email;
  const branchName = ctx?.branchName ?? copy.noBranch;
  const employeeCode = employee?.employee_code ?? copy.noEmployeeCode;
  const birthDateDisplay = formatBirthDate(birthDate);
  const profileEditDefaults = {
    fullName: displayName,
    phone: phone ?? "",
    birthDate: birthDate ?? "",
  };
  const signOutAction = (
    <form action="/api/auth/signout" method="post">
      <Button
        type="submit"
        variant="ghost"
        size="touch"
        className="w-full sm:w-fit"
      >
        <IconLogout data-icon="inline-start" />
        {ACTIONS_VI.signOut}
      </Button>
    </form>
  );

  if (plane === "branch") {
    return (
      <BranchOperatorPage
        title={copy.title}
        description={copy.description}
        hideHeaderOnMobile
        badge={{ children: positionLabel, variant: "outline" }}
      >
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b pb-3">
          <Avatar className="h-16 min-h-16 w-16 min-w-16 sm:h-20 sm:w-20">
            {avatarUrl ? (
              <AvatarImage src={avatarUrl} alt={displayName} />
            ) : null}
            <AvatarFallback className="text-xl font-semibold">
              {getInitials(displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold sm:text-lg">
              {displayName}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {positionLabel} · {branchName}
            </p>
            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
              {copy.employeeCode}: {employeeCode}
            </p>
          </div>
          <ProfileEditAction
            branchId={effectiveBranchId}
            buttonSize="touch"
            buttonVariant="outline"
            triggerLabel={copy.editProfileShort}
            defaultValues={profileEditDefaults}
          />
        </div>

        <BranchOperatorActionBar align="start">
          <ProfileAvatarAction
            branchId={effectiveBranchId}
            buttonSize="touch"
            buttonVariant="outline"
          />
          {branchId ? (
            <Button asChild variant="outline" size="touch">
              <Link href={`/br/${branchId}/profile/payslip`}>
                <IconPayslip data-icon="inline-start" />
                {messages.employee.payslip.title}
              </Link>
            </Button>
          ) : null}
        </BranchOperatorActionBar>

        <BranchOperatorDetailList
          columns={3}
          rows={[
            {
              label: copy.phone,
              value: phone ? (
                <a
                  aria-label={`${copy.phone}: ${phone}`}
                  className="inline-flex min-h-11 items-center text-primary hover:underline"
                  href={`tel:${phone.replace(/\s+/g, "")}`}
                >
                  {phone}
                </a>
              ) : (
                copy.noPhone
              ),
              muted: !phone,
            },
            {
              label: copy.birthDate,
              value: birthDateDisplay ?? copy.noBirthDate,
              muted: !birthDateDisplay,
            },
            {
              label: copy.email,
              value: email ? (
                <a
                  aria-label={`${copy.email}: ${email}`}
                  className="inline-flex min-h-11 items-center text-primary hover:underline"
                  href={`mailto:${email}`}
                >
                  {email}
                </a>
              ) : (
                copy.noEmail
              ),
              muted: !email,
            },
          ]}
        />

        <BranchOperatorActionBar align="end">
          {signOutAction}
        </BranchOperatorActionBar>
      </BranchOperatorPage>
    );
  }

  return (
    <EmployeePage
      title={copy.title}
      description={copy.description}
      badge={{ children: positionLabel, variant: "outline" }}
      hideHeaderOnMobile
    >
      <EmployeePanel tone="info" size="sm">
        <div className="grid gap-4">
          <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 sm:gap-x-4">
            <div className="group/avatar-upload relative row-span-2 size-28 shrink-0 overflow-hidden rounded-full sm:size-32">
              <Avatar className="size-full min-h-full min-w-full">
                {avatarUrl ? (
                  <AvatarImage src={avatarUrl} alt={displayName} />
                ) : null}
                <AvatarFallback className="text-3xl font-semibold">
                  {getInitials(displayName)}
                </AvatarFallback>
              </Avatar>

              <ProfileAvatarAction
                branchId={effectiveBranchId}
                buttonSize="sm"
                buttonVariant="ghost"
                className="pointer-events-none absolute inset-0 z-10 h-auto min-h-0 flex-col rounded-full border-transparent bg-foreground/50 p-0 text-background opacity-0 transition-opacity has-data-[icon=inline-start]:pl-0 has-data-[icon=inline-end]:pr-0 hover:bg-foreground/50 group-focus-within/avatar-upload:pointer-events-auto group-focus-within/avatar-upload:opacity-100 group-hover/avatar-upload:pointer-events-auto group-hover/avatar-upload:opacity-100"
              />
            </div>

            <div className="min-w-0 pt-1">
              <p className="truncate text-lg font-semibold leading-6">
                {displayName}
              </p>
              <p className="min-w-0 break-words text-sm text-muted-foreground">
                {positionLabel} - {branchName}
              </p>
              <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                {copy.employeeCode}: {employeeCode}
              </p>
            </div>

            <ProfileEditAction
              branchId={effectiveBranchId}
              buttonSize="sm"
              buttonVariant="outline"
              className="justify-self-end"
              triggerLabel={copy.editProfileShort}
              defaultValues={profileEditDefaults}
            />
          </div>

          <div className="grid gap-2 border-t border-border/60 pt-3 text-sm">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
              {phone ? (
                <a
                  aria-label={`${copy.phone}: ${phone}`}
                  className="inline-flex min-w-0 items-center gap-2 text-primary hover:underline"
                  href={`tel:${phone.replace(/\s+/g, "")}`}
                >
                  <IconPhone
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0 truncate">{phone}</span>
                </a>
              ) : (
                <span
                  aria-label={`${copy.phone}: ${copy.noPhone}`}
                  className="inline-flex min-w-0 items-center gap-2 text-muted-foreground"
                >
                  <IconPhone aria-hidden="true" className="size-4 shrink-0" />
                  <span className="min-w-0 truncate">{copy.noPhone}</span>
                </span>
              )}
              {birthDateDisplay ? (
                <span
                  aria-label={`${copy.birthDate}: ${birthDateDisplay}`}
                  className="inline-flex min-w-0 items-center gap-2 text-foreground"
                >
                  <IconBirthDate
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0 truncate">{birthDateDisplay}</span>
                </span>
              ) : (
                <span
                  aria-label={`${copy.birthDate}: ${copy.noBirthDate}`}
                  className="inline-flex min-w-0 items-center gap-2 text-muted-foreground"
                >
                  <IconBirthDate
                    aria-hidden="true"
                    className="size-4 shrink-0"
                  />
                  <span className="min-w-0 truncate">{copy.noBirthDate}</span>
                </span>
              )}
            </div>
            {email ? (
              <a
                aria-label={`${copy.email}: ${email}`}
                className="inline-flex min-w-0 items-center gap-2 text-primary hover:underline"
                href={`mailto:${email}`}
              >
                <IconMail
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 truncate">{email}</span>
              </a>
            ) : (
              <span
                aria-label={`${copy.email}: ${copy.noEmail}`}
                className="inline-flex min-w-0 items-center gap-2 text-muted-foreground"
              >
                <IconMail aria-hidden="true" className="size-4 shrink-0" />
                <span className="min-w-0 truncate">{copy.noEmail}</span>
              </span>
            )}
          </div>
        </div>
      </EmployeePanel>

      <EmployeeActionBar align="end">{signOutAction}</EmployeeActionBar>
    </EmployeePage>
  );
}
