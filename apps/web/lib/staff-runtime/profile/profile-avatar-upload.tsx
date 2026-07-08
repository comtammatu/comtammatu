"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload as IconUpload } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { messages } from "@lib/messages";
import { uploadMyAvatar } from "./actions";

const copy = messages.employee.profile;
const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 1_500_000;
const TARGET_DIMENSION = 512;
const WEBP_QUALITY = 0.82;
type ProfileButtonSize = "sm" | "touch";
type ProfileButtonVariant = "default" | "outline" | "ghost";

async function resizeAvatar(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(
    1,
    TARGET_DIMENSION / Math.max(bitmap.width, bitmap.height),
  );
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob(
      (value) => resolve(value ?? file),
      "image/webp",
      WEBP_QUALITY,
    );
  });
  return new File([blob], "avatar.webp", { type: "image/webp" });
}

export function ProfileAvatarUpload({
  branchId,
  className,
  buttonSize = "touch",
  buttonVariant = "outline",
}: {
  branchId: number | null;
  className?: string;
  buttonSize?: ProfileButtonSize;
  buttonVariant?: ProfileButtonVariant;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleFile(file: File) {
    if (!AVATAR_ACCEPT.split(",").includes(file.type)) {
      toast.error(copy.avatarTypeError);
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      toast.error(copy.avatarTooLarge);
      return;
    }

    setUploading(true);
    try {
      const resized = await resizeAvatar(file);
      if (resized.size > MAX_UPLOAD_BYTES) {
        toast.error(copy.avatarTooLarge);
        return;
      }

      const formData = new FormData();
      formData.set("avatar", resized);
      if (branchId) formData.set("branchId", String(branchId));
      const result = await uploadMyAvatar(formData);
      if (!result.success) {
        toast.error(result.error ?? copy.avatarUploadError);
        return;
      }

      toast.success(copy.avatarSaved);
      router.refresh();
    } catch {
      toast.error(copy.avatarUploadError);
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={AVATAR_ACCEPT}
        className="hidden"
        disabled={uploading}
        aria-label={copy.uploadAvatar}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
          event.target.value = "";
        }}
      />
      <Button
        type="button"
        variant={buttonVariant}
        size={buttonSize}
        className={className}
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <IconUpload data-icon="inline-start" />
        )}
        {uploading ? copy.avatarUploading : copy.uploadAvatar}
      </Button>
    </>
  );
}
