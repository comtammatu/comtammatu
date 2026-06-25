"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Skeleton } from "@comtammatu/ui/components/skeleton";
import { cn } from "@comtammatu/ui";

interface PaymentQrCodeProps {
  value: string;
  alt: string;
  className?: string;
}

export function PaymentQrCode({
  value,
  alt,
  className,
}: PaymentQrCodeProps) {
  const [directImageFailed, setDirectImageFailed] = useState(false);
  const [generatedDataUrl, setGeneratedDataUrl] = useState<string | null>(null);
  const [generationFailed, setGenerationFailed] = useState(false);

  const canTryDirectImage = useMemo(() => /^data:image\//i.test(value), [value]);
  const useDirectImage = canTryDirectImage && !directImageFailed;

  useEffect(() => {
    setDirectImageFailed(false);
    setGenerationFailed(false);
  }, [value]);

  useEffect(() => {
    if (useDirectImage) {
      setGeneratedDataUrl(null);
      return;
    }

    let cancelled = false;
    void QRCode.toDataURL(value, {
      errorCorrectionLevel: "M",
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
  }, [useDirectImage, value]);

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
