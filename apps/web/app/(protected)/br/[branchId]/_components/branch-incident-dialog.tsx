"use client";

import { useState } from "react";
import { z } from "zod";
import { Button } from "@comtammatu/ui/components/button";
import { Frame } from "@comtammatu/ui/components/frame";
import {
  AlertTriangle as IconAlertTriangle,
  Camera as IconCamera,
  Trash2 as IconTrash2,
} from "lucide-react";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  FormDialog,
  SelectField,
  TextField,
  TextareaField,
} from "@/components/form";
import { operator } from "@lib/messages/operator";
import {
  createBranchIncidentAction,
  uploadBranchIncidentPhotoAction,
} from "../_lib/incident-actions";

const branchIncidentFormSchema = z.object({
  category: z.enum(["it", "kitchen", "facility", "service"]),
  title: z.string().trim().min(3, "Tiêu đề tối thiểu 3 ký tự").max(200),
  description: z.string().trim().max(2000).optional(),
  priority: z.enum(["high", "urgent"]).default("urgent"),
  photoUrl: z.string().optional(),
  photoFileName: z.string().optional(),
  photoByteSize: z.number().optional(),
});

type BranchIncidentFormValues = z.infer<typeof branchIncidentFormSchema>;

interface BranchIncidentDialogProps {
  branchId: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}

const CATEGORY_OPTIONS = [
  { value: "it", label: "POS / Máy in / Mạng" },
  { value: "kitchen", label: "Bếp / Tủ mát / Kho" },
  { value: "facility", label: "Điện nước / Cơ sở" },
  { value: "service", label: "Dịch vụ / Khách hàng" },
];

const PRIORITY_OPTIONS = [
  { value: "urgent", label: "Khẩn cấp (Xử lý ngay)" },
  { value: "high", label: "Ưu tiên cao (Trong ca)" },
];

export function BranchIncidentDialog({
  branchId,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: BranchIncidentDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const onOpenChange = isControlled
    ? (controlledOnOpenChange ?? (() => {}))
    : setInternalOpen;

  return (
    <>
      {!isControlled ? (
        <Button
          type="button"
          variant="outline"
          size="icon-touch"
          className="text-destructive"
          aria-label={operator.incident.triggerAria}
          onClick={() => onOpenChange?.(true)}
        >
          <IconAlertTriangle />
        </Button>
      ) : null}

      <FormDialog<BranchIncidentFormValues>
        open={open}
        onOpenChange={onOpenChange}
        title={operator.incident.title}
        description={operator.incident.description}
        schema={branchIncidentFormSchema}
        defaultValues={{
          category: "it",
          title: "",
          description: "",
          priority: "urgent",
        }}
        submitLabel={operator.incident.submitLabel}
        submitVariant="destructive"
        successMessage={operator.incident.successMessage}
        onSubmit={async (values) => {
          return await createBranchIncidentAction({
            ...values,
            branchId,
          });
        }}
      >
        {(form) => (
          <>
            <SelectField
              control={form.control}
              name="category"
              label={operator.incident.categoryLabel}
              options={CATEGORY_OPTIONS}
            />
            <TextField
              control={form.control}
              name="title"
              label={operator.incident.titleLabel}
              placeholder={operator.incident.titlePlaceholder}
            />
            <TextareaField
              control={form.control}
              name="description"
              label={operator.incident.descLabel}
              placeholder={operator.incident.descPlaceholder}
            />
            <SelectField
              control={form.control}
              name="priority"
              label={operator.incident.priorityLabel}
              options={PRIORITY_OPTIONS}
            />

            <div className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-foreground">
                {operator.incident.photoLabel}
              </span>
              {form.watch("photoUrl") ? (
                <Frame className="flex items-center gap-3 bg-muted/30 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={form.watch("photoUrl")}
                    alt="Incident proof"
                    className="size-14 rounded border border-border object-cover"
                  />
                  <div className="min-w-0 flex-1 text-xs">
                    <span className="block truncate font-medium">
                      {form.watch("photoFileName") || "incident-photo.jpg"}
                    </span>
                    <span className="font-mono text-2xs text-muted-foreground">
                      {form.watch("photoByteSize")
                        ? `${Math.round(form.watch("photoByteSize")! / 1024)} KB`
                        : ""}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-touch"
                    className="text-destructive hover:bg-destructive/10"
                    aria-label={operator.incident.photoDelete}
                    onClick={() => {
                      form.setValue("photoUrl", undefined);
                      form.setValue("photoFileName", undefined);
                      form.setValue("photoByteSize", undefined);
                    }}
                  >
                    <IconTrash2 className="size-4" />
                  </Button>
                </Frame>
              ) : (
                <label className="inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    disabled={isUploadingPhoto}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setIsUploadingPhoto(true);
                      try {
                        const fd = new FormData();
                        fd.append("branchId", String(branchId));
                        fd.append("file", file);
                        const res = await uploadBranchIncidentPhotoAction(fd);
                        if (!res.success || !res.data) {
                          toast.error(res.error ?? operator.incident.photoUploadFailed);
                          return;
                        }
                        form.setValue("photoUrl", res.data.url);
                        form.setValue("photoFileName", res.data.fileName);
                        form.setValue("photoByteSize", res.data.byteSize);
                      } catch {
                        toast.error(operator.incident.photoUploadFailed);
                      } finally {
                        setIsUploadingPhoto(false);
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isUploadingPhoto}
                    className="pointer-events-none gap-2"
                  >
                    <IconCamera className="size-4" />
                    <span>
                      {isUploadingPhoto
                        ? operator.incident.photoUploading
                        : operator.incident.photoButton}
                    </span>
                  </Button>
                </label>
              )}
            </div>
          </>
        )}
      </FormDialog>
    </>
  );
}

