"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Trash as IconTrash, Upload as IconUpload } from "lucide-react";
import { createClient } from "@comtammatu/database/supabase/client";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";

import { ACTIONS_VI, MENU_VI } from "@comtammatu/shared/messages";
const BUCKET = "menu-images";
const MAX_SIZE = 5 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
// 800 is the upper bound the POS optimizer asks for (deviceSizes 320..960
// in next.config); shipping a larger source just gets re-encoded down by
// /_next/image. WebP at q=0.82 = ~40-60% smaller than JPEG q=0.82 with no
// perceptual loss for menu thumbs. Existing JPEGs in Storage stay valid —
// `<Image>` handles either source format and the optimizer normalises both
// to WebP/AVIF on delivery.
const TARGET_DIMENSION = 800;
const WEBP_QUALITY = 0.82;

interface MenuImageInputProps {
  tenantId: number;
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

async function resizeImage(file: File): Promise<Blob> {
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

  return new Promise<Blob>((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? file), "image/webp", WEBP_QUALITY);
  });
}

export function MenuImageInput({
  tenantId,
  value,
  onChange,
  disabled,
}: MenuImageInputProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!ACCEPTED.includes(file.type)) {
      toast.error(MENU_VI.imageTypeError);
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error(MENU_VI.imageTooLarge);
      return;
    }
    setUploading(true);
    try {
      const supabase = createClient();
      // Resize client-side: 2 MB camera shots become ~150-250 KB,
      // avoiding multi-MB downloads on POS when categories switch.
      const blob = await resizeImage(file);
      const path = `${tenantId}/menu-${Date.now()}-${randomSuffix()}.webp`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, {
          // Random suffix → unique URL → safe to cache 1 year immutable.
          cacheControl: "31536000, immutable",
          upsert: false,
          contentType: "image/webp",
        });
      if (upErr) {
        toast.error(upErr.message);
        return;
      }
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success("Đã tải ảnh lên.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className="hidden"
        disabled={disabled || uploading}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />
      {value ? (
        <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3">
          <Image
            src={value}
            alt={MENU_VI.imageAlt}
            width={64}
            height={64}
            className="size-16 rounded-md object-cover"
          />
          <div className="flex flex-1 flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? <Spinner /> : <IconUpload className="size-4" />}
              {uploading ? MENU_VI.imageUploading : MENU_VI.changeImage}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive"
              disabled={disabled || uploading}
              onClick={() => onChange(null)}
            >
              <IconTrash className="size-4" />
              {ACTIONS_VI.delete}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Spinner /> : <IconUpload className="size-4" />}
          {uploading ? MENU_VI.imageUploading : MENU_VI.uploadImage}
        </Button>
      )}
    </div>
  );
}
