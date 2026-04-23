"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { createClient } from "@comtammatu/database/supabase/client";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { IconTrash, IconUpload } from "@tabler/icons-react";
import { toast } from "@comtammatu/ui/components/sonner";

const BUCKET = "inventory-attachments";

type Props = {
  tenantId: number;
  /** Folder under tenant prefix, e.g. "grn/123" or "supplier-return-line/456". */
  folder: string;
  value: string | null;
  onChange: (url: string | null) => void;
  /** Show plain URL input as fallback. Default true. */
  allowPaste?: boolean;
  disabled?: boolean;
};

function randomFileSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

function extFromName(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

export function PhotoUploadInput({
  tenantId,
  folder,
  value,
  onChange,
  allowPaste = true,
  disabled = false,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      toast.error("Chỉ chấp nhận ảnh hoặc PDF.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File vượt quá 10 MB.");
      return;
    }
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = extFromName(file.name) || ".jpg";
      const path = `${tenantId}/${folder}/${Date.now()}-${randomFileSuffix()}${ext}`;
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

  async function handleRemove() {
    if (!value) return;
    onChange(null);
  }

  const isImage = value && /\.(jpe?g|png|webp|heic)(\?.*)?$/i.test(value);
  const isPdf = value && /\.pdf(\?.*)?$/i.test(value);

  return (
    <div className="space-y-2">
      {value ? (
        <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-2">
          {isImage ? (
            <Image
              src={value}
              alt="attachment"
              width={56}
              height={56}
              className="size-14 rounded object-cover"
              unoptimized
            />
          ) : (
            <div className="flex size-14 items-center justify-center rounded bg-muted text-xs font-bold">
              {isPdf ? "PDF" : "FILE"}
            </div>
          )}
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className="flex-1 truncate text-xs text-primary underline"
          >
            {value.split("/").pop()}
          </a>
          {!disabled ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="text-destructive"
              onClick={handleRemove}
              aria-label="Xóa"
            >
              <IconTrash className="size-4" />
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            disabled={disabled || uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? <Spinner /> : <IconUpload className="size-4" />}
              {uploading ? "Đang tải…" : "Tải ảnh / PDF"}
            </Button>
            {allowPaste ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPasteMode((v) => !v)}
                disabled={disabled}
              >
                {pasteMode ? "Đóng dán URL" : "Dán URL có sẵn"}
              </Button>
            ) : null}
          </div>
          {pasteMode ? (
            <Input
              type="url"
              placeholder="https://…"
              onChange={(e) => onChange(e.target.value || null)}
              disabled={disabled}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
