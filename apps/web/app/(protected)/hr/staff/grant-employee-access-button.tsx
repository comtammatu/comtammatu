"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  KeyRound as IconKeyRound,
  Search as IconSearch,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { AppDialog } from "@/components/form";
import { messages } from "@lib/messages";
import { matchesSearch } from "@lib/search";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import type { EmployeeRow } from "../_types";
import { toggleStaffActive } from "./actions";
import type { StaffRow } from "./staff-table";
import {
  resolveHrBranchScope,
  withHrBranchScope,
} from "@/lib/hr-scope";

type GrantEmployeeAccessButtonProps = {
  employees: EmployeeRow[];
  staff: StaffRow[];
};

export function GrantEmployeeAccessButton({
  employees,
  staff,
}: GrantEmployeeAccessButtonProps) {
  const router = useRouter();
  const branchScope = resolveHrBranchScope(useSearchParams().get("branch"));
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const staffCopy = messages.owner.staffPage;

  const loginActiveByProfileId = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const member of staff) {
      map.set(member.id, member.is_active !== false);
    }
    return map;
  }, [staff]);

  const candidates = useMemo(() => {
    return employees
      .filter((employee) => employee.profiles?.id)
      .filter((employee) =>
        matchesSearch(
          [
            employee.profiles?.full_name,
            employee.employee_code,
            employee.profiles?.phone,
            employee.profiles?.positions?.label_vi,
            employee.profiles?.branches?.name,
          ],
          search,
        ),
      )
      .toSorted((a, b) =>
        (a.profiles?.full_name ?? "").localeCompare(
          b.profiles?.full_name ?? "",
          "vi",
        ),
      );
  }, [employees, search]);

  function openPermissions(profileId: string) {
    setOpen(false);
    setSearch("");
    router.push(
      withHrBranchScope(
        `/hr/staff/${profileId}/permissions?tab=permissions`,
        branchScope,
      ),
    );
  }

  function handleSelect(employee: EmployeeRow) {
    const profileId = employee.profiles?.id;
    if (!profileId) return;

    const loginActive = loginActiveByProfileId.get(profileId);
    if (loginActive === false) {
      void (async () => {
        const ok = await confirm({
          title: staffCopy.actionActivate,
          description: staffCopy.grantActivateFirst,
          details: [
            {
              label: employee.profiles?.full_name ?? "",
              value: employee.employee_code ?? profileId,
            },
          ],
          confirmText: staffCopy.actionActivate,
        });
        if (!ok) return;
        startTransition(async () => {
          const result = await toggleStaffActive(profileId);
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          openPermissions(profileId);
        });
      })();
      return;
    }

    openPermissions(profileId);
  }

  return (
    <>
      <Button variant="outline" size="touch" onClick={() => setOpen(true)}>
        <IconKeyRound data-icon="inline-start" />
        {staffCopy.grantForEmployee}
      </Button>
      <AppDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch("");
        }}
        title={staffCopy.grantForEmployeeTitle}
        description={staffCopy.grantForEmployeeDescription}
      >
        <div className="grid gap-3">
          <InputGroup size="touch" className="min-w-0">
            <InputGroupAddon>
              <IconSearch />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              autoComplete="off"
              aria-label={staffCopy.grantForEmployeeSearch}
              placeholder={staffCopy.grantForEmployeeSearch}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </InputGroup>
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {staffCopy.grantForEmployeeEmpty}
            </p>
          ) : (
            <ItemGroup className="max-h-72 gap-2 overflow-y-auto" role="list">
              {candidates.map((employee) => {
                const name = employee.profiles?.full_name ?? "—";
                const meta = [
                  employee.employee_code,
                  employee.profiles?.positions?.label_vi,
                  employee.profiles?.branches?.name,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <Item
                    key={employee.id}
                    variant="outline"
                    size="sm"
                    role="listitem"
                    render={
                      <Button
                        variant="ghost"
                        disabled={isPending}
                        className="h-auto w-full justify-start px-3 py-2"
                        onClick={() => handleSelect(employee)}
                      />
                    }
                  >
                    <ItemContent>
                      <ItemTitle>{name}</ItemTitle>
                      {meta ? (
                        <ItemDescription>{meta}</ItemDescription>
                      ) : null}
                    </ItemContent>
                  </Item>
                );
              })}
            </ItemGroup>
          )}
        </div>
      </AppDialog>
    </>
  );
}
