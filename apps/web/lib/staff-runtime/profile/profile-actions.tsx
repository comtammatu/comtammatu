"use client";

import dynamic from "next/dynamic";
import { Pencil as IconPencil, Upload as IconUpload } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { messages } from "@lib/messages";

const copy = messages.employee.profile;

type ProfileFormValues = {
  fullName: string;
  phone: string;
  birthDate: string;
};
type ProfileButtonSize = "sm" | "touch";
type ProfileButtonVariant = "default" | "outline" | "ghost";

type ProfileEditActionProps = {
  branchId: number | null;
  defaultValues: ProfileFormValues;
  className?: string;
  buttonSize?: ProfileButtonSize;
  buttonVariant?: ProfileButtonVariant;
  triggerLabel?: string;
};

type ProfileAvatarActionProps = {
  branchId: number | null;
  className?: string;
  buttonSize?: ProfileButtonSize;
  buttonVariant?: ProfileButtonVariant;
};

const LazyProfileEditDialog = dynamic<ProfileEditActionProps>(
  () => import("./profile-edit-dialog").then((mod) => mod.ProfileEditDialog),
  {
    ssr: false,
    loading: () => (
      <Button size="sm" className="shrink-0" disabled>
        <IconPencil data-icon="inline-start" />
        {copy.editProfileShort}
      </Button>
    ),
  },
);

const LazyProfileAvatarUpload = dynamic<ProfileAvatarActionProps>(
  () =>
    import("./profile-avatar-upload").then((mod) => mod.ProfileAvatarUpload),
  {
    ssr: false,
    loading: () => (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="pointer-events-none absolute inset-0 h-auto min-h-0 flex-col rounded-full border-transparent bg-foreground/50 p-0 text-background opacity-0 transition-opacity has-data-[icon=inline-start]:pl-0 has-data-[icon=inline-end]:pr-0 group-focus-within/avatar-upload:pointer-events-auto group-focus-within/avatar-upload:opacity-100 group-hover/avatar-upload:pointer-events-auto group-hover/avatar-upload:opacity-100"
        disabled
      >
        <IconUpload data-icon="inline-start" />
        {copy.uploadAvatar}
      </Button>
    ),
  },
);

export function ProfileEditAction(props: ProfileEditActionProps) {
  return <LazyProfileEditDialog {...props} />;
}

export function ProfileAvatarAction(props: ProfileAvatarActionProps) {
  return <LazyProfileAvatarUpload {...props} />;
}
