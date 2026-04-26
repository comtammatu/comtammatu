"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Trash as IconTrash, Upload as IconUpload } from "lucide-react";
import { createClient } from "@comtammatu/database/supabase/client";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";

const BUCKET = "menu-images";
const MAX_SIZE = 5 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

interface MenuImageInputProps {
  tenantId: number;
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

function extFromName(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : ".jpg";
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
      toast.error("Chỉ chấp nhận JPG, PNG hoặc WebP.");
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error("Ảnh vượt quá 5 MB.");
      return;
    }
    setUploading(true);
    try {
      const supabase = createClient();
      const path = `${tenantId}/menu-${Date.now()}-${randomSuffix()}${extFromName(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
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
    <div className="space-y-2">
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
        <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-2">
          <Image
            src={value}
            alt="Ảnh món"
            width={64}
            height={64}
            className="size-16 rounded object-cover"
            unoptimized
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
              {uploading ? "Đang tải…" : "Đổi ảnh"}
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
              Xóa
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
          {uploading ? "Đang tải…" : "Tải ảnh món (≤ 5 MB)"}
        </Button>
      )}
    </div>
  );
}
