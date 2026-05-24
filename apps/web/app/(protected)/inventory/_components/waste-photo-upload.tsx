"use client";

import { PhotoUploadInput } from "./photo-upload-input";

interface WastePhotoUploadProps {
  tenantId: number;
  /** stock_issue_items.id when available; otherwise temp id before persist. */
  issueId: number | string;
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
  /** Allow fallback gallery upload when camera fails (hotel wifi blocks, etc). */
  allowGalleryFallback?: boolean;
}

/**
 * Waste tier-1 photo capture.
 *
 * Camera-only by default: `captureCamera=true` on native file input
 * triggers rear camera on mobile. Desktop browsers fall through to file
 * picker automatically.
 *
 * EXIF ≤5min server validation is DEFERRED to Edge Function
 * (`validate-waste-photo`). Client UI does NOT pre-check EXIF — we trust
 * the camera-capture flag and rely on server rejection.
 */
export function WastePhotoUpload({
  tenantId,
  issueId,
  value,
  onChange,
  disabled,
  allowGalleryFallback = false,
}: WastePhotoUploadProps) {
  return (
    <PhotoUploadInput
      tenantId={tenantId}
      folder={`waste/${issueId}`}
      value={value}
      onChange={onChange}
      disabled={disabled}
      acceptTypes="image"
      captureCamera={!allowGalleryFallback}
      allowPaste={false}
    />
  );
}
