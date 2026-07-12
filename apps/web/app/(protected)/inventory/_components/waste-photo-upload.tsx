"use client";

import { PhotoUploadInput } from "./photo-upload-input";

interface WastePhotoUploadProps {
  id?: string;
  tenantId: number;
  branchId: number;
  /** stock_issue_items.id when available; otherwise temp id before persist. */
  issueId: number | string;
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
  /** Allow fallback gallery upload when camera fails (hotel wifi blocks, etc). */
  allowGalleryFallback?: boolean;
}

export function WastePhotoUpload({
  id,
  tenantId,
  branchId,
  issueId,
  value,
  onChange,
  disabled,
  allowGalleryFallback = false,
}: WastePhotoUploadProps) {
  return (
    <PhotoUploadInput
      id={id}
      tenantId={tenantId}
      folder={`waste/${branchId}/${issueId}`}
      value={value}
      onChange={onChange}
      disabled={disabled}
      acceptTypes="image"
      captureCamera={!allowGalleryFallback}
      allowPaste={false}
    />
  );
}
