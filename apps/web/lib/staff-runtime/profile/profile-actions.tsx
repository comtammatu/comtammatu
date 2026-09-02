"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import {
  KeyRound as IconKeyRound,
  Landmark as IconBank,
  Pencil as IconPencil,
  Upload as IconUpload,
} from "lucide-react";
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

type ProfileSecurityActionProps = {
  branchId: number | null;
  className?: string;
  buttonSize?: ProfileButtonSize;
  buttonVariant?: ProfileButtonVariant;
  triggerLabel?: string;
};

type ProfileBankActionProps = {
  branchId: number | null;
  defaultValues?: {
    bankAccount?: string;
    bankName?: string;
    idNumber?: string;
  };
  className?: string;
  buttonSize?: ProfileButtonSize;
  buttonVariant?: ProfileButtonVariant;
  triggerLabel?: string;
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

const LazyProfileSecurityDialog = dynamic<ProfileSecurityActionProps>(
  () =>
    import("./profile-security-dialog").then(
      (mod) => mod.ProfileSecurityDialog,
    ),
  { ssr: false },
);

const LazyProfileBankDialog = dynamic<ProfileBankActionProps>(
  () => import("./profile-bank-dialog").then((mod) => mod.ProfileBankDialog),
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

function ProfileSecurityFallback({
  buttonSize = "touch",
  buttonVariant = "outline",
  className,
  triggerLabel = copy.changePasswordShort,
}: ProfileSecurityActionProps) {
  return (
    <Button
      type="button"
      variant={buttonVariant}
      size={buttonSize}
      className={className}
      disabled
    >
      <IconKeyRound data-icon="inline-start" />
      {triggerLabel}
    </Button>
  );
}

function ProfileBankFallback({
  buttonSize = "touch",
  buttonVariant = "outline",
  className,
  triggerLabel = copy.editBankShort,
}: ProfileBankActionProps) {
  return (
    <Button
      type="button"
      variant={buttonVariant}
      size={buttonSize}
      className={className}
      disabled
    >
      <IconBank data-icon="inline-start" />
      {triggerLabel}
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

export function ProfileSecurityAction(props: ProfileSecurityActionProps) {
  return (
    <Suspense fallback={<ProfileSecurityFallback {...props} />}>
      <LazyProfileSecurityDialog {...props} />
    </Suspense>
  );
}

export function ProfileBankAction(props: ProfileBankActionProps) {
  return (
    <Suspense fallback={<ProfileBankFallback {...props} />}>
      <LazyProfileBankDialog {...props} />
    </Suspense>
  );
}
