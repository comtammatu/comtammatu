"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Skeleton } from "@comtammatu/ui/components/skeleton";
import { cn } from "@comtammatu/ui";

interface PaymentQrCodeProps {
  value: string;
  alt: string;
  className?: string;
  centerLogoAlt?: string;
  centerLogoSrc?: string;
  preferImage?: boolean;
}

export function PaymentQrCode({
  value,
  alt,
  className,
  centerLogoAlt = "Logo",
  centerLogoSrc,
  preferImage = false,
}: PaymentQrCodeProps) {
  const [directImageFailed, setDirectImageFailed] = useState(false);
  const [generatedDataUrl, setGeneratedDataUrl] = useState<string | null>(null);
  const [generationFailed, setGenerationFailed] = useState(false);

  const canTryDirectImage = useMemo(
    () =>
      /^data:image\//i.test(value) ||
      (preferImage && /^https?:\/\//i.test(value)),
    [preferImage, value],
  );
  const useDirectImage = canTryDirectImage && !directImageFailed;
  const canGenerateQr = !canTryDirectImage;

  useEffect(() => {
    setDirectImageFailed(false);
    setGenerationFailed(false);
  }, [value]);

  useEffect(() => {
    if (useDirectImage || !canGenerateQr) {
      setGeneratedDataUrl(null);
      return;
    }

    let cancelled = false;
    void QRCode.toDataURL(value, {
      errorCorrectionLevel: centerLogoSrc ? "H" : "M",
      margin: 2,
      width: 320,
    })
      .then((dataUrl) => {
        if (!cancelled) setGeneratedDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setGenerationFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [canGenerateQr, centerLogoSrc, useDirectImage, value]);

  if (useDirectImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={value}
        alt={alt}
        className={cn(
          "mx-auto max-h-72 w-full max-w-72 object-contain",
          className,
        )}
        onError={() => setDirectImageFailed(true)}
      />
    );
  }

  if (generatedDataUrl && !generationFailed) {
    if (centerLogoSrc) {
      return (
        <div className={cn("relative mx-auto w-full max-w-72", className)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={generatedDataUrl}
            alt={alt}
            className="mx-auto max-h-72 w-full object-contain"
          />
          <span className="pointer-events-none absolute left-1/2 top-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg bg-white p-1.5 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={centerLogoSrc}
              alt={centerLogoAlt}
              className="size-full object-contain"
            />
          </span>
        </div>
      );
    }

    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={generatedDataUrl}
        alt={alt}
        className={cn(
          "mx-auto max-h-72 w-full max-w-72 object-contain",
          className,
        )}
      />
    );
  }

  return <Skeleton className={cn("mx-auto size-48", className)} />;
}
