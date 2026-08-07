"use client";

import { Suspense } from "react";
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
  { ssr: false },
);

const LazyProfileAvatarUpload = dynamic<ProfileAvatarActionProps>(
  () =>
    import("./profile-avatar-upload").then((mod) => mod.ProfileAvatarUpload),
  { ssr: false },
);

function ProfileEditFallback({
  buttonSize = "sm",
  buttonVariant = "outline",
  className,
  triggerLabel = copy.editProfileShort,
}: ProfileEditActionProps) {
  return (
    <Button
      type="button"
      variant={buttonVariant}
      size={buttonSize}
      className={className}
      disabled
    >
      <IconPencil data-icon="inline-start" />
      {triggerLabel}
    </Button>
  );
}

function ProfileAvatarFallback({
  buttonSize = "touch",
  buttonVariant = "outline",
  className,
}: ProfileAvatarActionProps) {
  return (
    <Button
      type="button"
      variant={buttonVariant}
      size={buttonSize}
      className={className}
      disabled
    >
      <IconUpload data-icon="inline-start" />
      {copy.uploadAvatar}
    </Button>
  );
}

export function ProfileEditAction(props: ProfileEditActionProps) {
  return (
    <Suspense fallback={<ProfileEditFallback {...props} />}>
      <LazyProfileEditDialog {...props} />
    </Suspense>
  );
}

export function ProfileAvatarAction(props: ProfileAvatarActionProps) {
  return (
    <Suspense fallback={<ProfileAvatarFallback {...props} />}>
      <LazyProfileAvatarUpload {...props} />
    </Suspense>
  );
}

