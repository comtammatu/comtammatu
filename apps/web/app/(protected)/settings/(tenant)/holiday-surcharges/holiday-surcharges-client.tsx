"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil as IconPencil, Plus as IconPlus } from "lucide-react";
import { formatPercent, formatVND } from "@comtammatu/shared/format";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppEmptyState } from "@/components/surface";
import {
  FormDialog,
  NumberField,
  SelectField,
  TextField,
  valuesToFormData,
} from "@/components/form";
import { SettingsFormSection } from "@/components/settings-form-section";
import { messages } from "@lib/messages";
import {
  setHolidaySurchargePolicyActive,
  upsertHolidaySurchargePolicy,
} from "./actions";
import {
  holidaySurchargeFormSchema,
  type HolidaySurchargeBranch,
  type HolidaySurchargeFormValues,
  type HolidaySurchargePolicy,
} from "./schema";

const SAIGON_OFFSET_MS = 7 * 60 * 60 * 1_000;

function toSaigonLocalInput(iso: string): string {
  const date = new Date(iso);
  return new Date(date.getTime() + SAIGON_OFFSET_MS).toISOString().slice(0, 16);
}

function addDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function toFormValues(
  policy: HolidaySurchargePolicy | null,
  nowIso: string,
): HolidaySurchargeFormValues {
  return {
    policy_id: policy ? String(policy.id) : undefined,
    name: policy?.name ?? "",
    branch_scope: policy?.branch_id ? String(policy.branch_id) : "tenant",
    calculation_type: policy?.calculation_type ?? "percentage",
    value: policy ? String(policy.value) : "10",
    starts_at_local: toSaigonLocalInput(policy?.starts_at ?? nowIso),
    ends_at_local: toSaigonLocalInput(policy?.ends_at ?? addDays(nowIso, 1)),
    is_active: policy?.is_active === false ? "false" : "true",
  };
}

function formatFormula(policy: HolidaySurchargePolicy): string {
  if (policy.calculation_type === "percentage") {
    return `${formatPercent(policy.value, 2)} trên tổng HĐĐT sau giảm giá`;
  }

  return `${formatVND(policy.value)} mỗi đơn`;
}

function resolveStatus(policy: HolidaySurchargePolicy, nowIso: string) {
  const copy = messages.settings.holidaySurcharges;
  const now = Date.parse(nowIso);
  const startsAt = Date.parse(policy.starts_at);
  const endsAt = Date.parse(policy.ends_at);
  if (!policy.is_active) {
    return { label: copy.inactive, variant: "secondary" as const };
  }
  if (now < startsAt) {
    return { label: copy.upcoming, variant: "info" as const };
  }
  if (now >= endsAt) {
    return { label: copy.ended, variant: "outline" as const };
  }
  return { label: copy.activeNow, variant: "success" as const };
}

interface HolidaySurchargesClientProps {
  policies: HolidaySurchargePolicy[];
  branches: HolidaySurchargeBranch[];
  nowIso: string;
}

export function HolidaySurchargesClient({
  policies,
  branches,
  nowIso,
}: HolidaySurchargesClientProps) {
  const router = useRouter();
  const copy = messages.settings.holidaySurcharges;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] =
    useState<HolidaySurchargePolicy | null>(null);
  const [pendingPolicyId, setPendingPolicyId] = useState<number | null>(null);
  const [isTogglePending, startToggleTransition] = useTransition();
  const formValues = useMemo(
    () => toFormValues(editingPolicy, nowIso),
    [editingPolicy, nowIso],
  );
  const branchOptions = useMemo(
    () => [
      { value: "tenant", label: copy.tenantScope },
      ...branches.map((branch) => ({
        value: String(branch.id),
        label: branch.name,
      })),
    ],
    [branches, copy.tenantScope],
  );

  function openCreateDialog() {
    setEditingPolicy(null);
    setDialogOpen(true);
  }

  function togglePolicy(policy: HolidaySurchargePolicy) {
    setPendingPolicyId(policy.id);
    startToggleTransition(async () => {
      const nextActive = !policy.is_active;
      const result = await setHolidaySurchargePolicyActive(
        policy.id,
        nextActive,
      );
      setPendingPolicyId(null);

      if (!result.success) {
        toast.error(result.error ?? copy.toggleFailed);
        return;
      }

      toast.success(nextActive ? copy.activated : copy.deactivated);
      router.refresh();
    });
  }

  return (
    <>
      <SettingsFormSection
        title={copy.sectionTitle}
        description={copy.sectionDescription}
        action={
          <Button size="touch" onClick={openCreateDialog}>
            <IconPlus data-icon="inline-start" />
            {copy.add}
          </Button>
        }
      >
        {policies.length === 0 ? (
          <AppEmptyState
            title={copy.emptyTitle}
            description={copy.emptyDescription}
          />
        ) : (
          <ItemGroup className="gap-3">
            {policies.map((policy) => {
              const status = resolveStatus(policy, nowIso);
              const pending = isTogglePending && pendingPolicyId === policy.id;

              return (
                <Item key={policy.id} variant="outline" size="default">
                  <ItemContent className="min-w-0 gap-1.5">
                    <ItemTitle
                      size="heading"
                      className="line-clamp-none flex-wrap"
                    >
                      {policy.name}
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </ItemTitle>
                    <ItemDescription className="line-clamp-none text-sm leading-6">
                      {copy.scope(policy.branch_name ?? copy.tenantScope)} ·{" "}
                      {formatFormula(policy)}
                    </ItemDescription>
                    <ItemDescription className="line-clamp-none text-sm leading-6">
                      {copy.period(
                        formatVNDateTime(policy.starts_at),
                        formatVNDateTime(policy.ends_at),
                      )}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions className="basis-full justify-start pt-1 sm:ml-auto sm:basis-auto sm:justify-end sm:pt-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="touch"
                      onClick={() => {
                        setEditingPolicy(policy);
                        setDialogOpen(true);
                      }}
                    >
                      <IconPencil data-icon="inline-start" />
                      {copy.edit}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="touch"
                      disabled={isTogglePending}
                      onClick={() => togglePolicy(policy)}
                    >
                      {pending ? <Spinner data-icon="inline-start" /> : null}
                      {policy.is_active ? copy.deactivate : copy.activate}
                    </Button>
                  </ItemActions>
                </Item>
              );
            })}
          </ItemGroup>
        )}
      </SettingsFormSection>

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editingPolicy ? copy.editTitle : copy.createTitle}
        description={copy.formDescription}
        schema={holidaySurchargeFormSchema}
        defaultValues={formValues}
        entityKey={editingPolicy?.id ?? "new"}
        submitLabel={editingPolicy ? copy.update : copy.create}
        onSubmit={async (values) => {
          const formData = valuesToFormData(values);
          if (editingPolicy) {
            formData.set("policy_id", String(editingPolicy.id));
          }
          return upsertHolidaySurchargePolicy(null, formData);
        }}
        onSuccess={() => {
          toast.success(editingPolicy ? copy.updated : copy.created);
          router.refresh();
        }}
      >
        {(form) => {
          const calculationType = form.watch("calculation_type");

          return (
            <>
              <TextField
                control={form.control}
                name="name"
                label={copy.nameLabel}
                placeholder={copy.namePlaceholder}
                required
              />
              <SelectField
                control={form.control}
                name="branch_scope"
                label={copy.scopeLabel}
                options={branchOptions}
                required
              />
              <SelectField
                control={form.control}
                name="calculation_type"
                label={copy.calculationTypeLabel}
                options={[
                  { value: "percentage", label: copy.percentage },
                  { value: "fixed", label: copy.fixed },
                ]}
                required
              />
              <NumberField
                control={form.control}
                name="value"
                label={
                  calculationType === "percentage"
                    ? copy.valuePercentageLabel
                    : copy.valueFixedLabel
                }
                description={
                  calculationType === "percentage"
                    ? copy.percentageHelp
                    : copy.fixedHelp
                }
                maxFractionDigits={calculationType === "percentage" ? 2 : 0}
                required
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  control={form.control}
                  name="starts_at_local"
                  label={copy.startsAtLabel}
                  type="datetime-local"
                  required
                />
                <TextField
                  control={form.control}
                  name="ends_at_local"
                  label={copy.endsAtLabel}
                  type="datetime-local"
                  required
                />
              </div>
              <SelectField
                control={form.control}
                name="is_active"
                label={copy.stateLabel}
                options={[
                  { value: "true", label: copy.enabled },
                  { value: "false", label: copy.disabled },
                ]}
                required
              />
            </>
          );
        }}
      </FormDialog>
    </>
  );
}
