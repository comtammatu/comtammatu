"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { cn } from "@comtammatu/ui";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Button } from "@comtammatu/ui/components/button";
import { Skeleton } from "@comtammatu/ui/components/skeleton";

interface QrCodeImageProps {
  value: string;
  alt: string;
  className?: string;
  errorMessage?: string;
  retryLabel?: string;
}

export function QrCodeImage({
  value,
  alt,
  className,
  errorMessage = "Không thể hiển thị mã QR.",
  retryLabel = "Thử lại",
}: QrCodeImageProps) {
  const [directImageFailed, setDirectImageFailed] = useState(false);
  const [generatedDataUrl, setGeneratedDataUrl] = useState<string | null>(null);
  const [generationFailed, setGenerationFailed] = useState(false);
  const [generationAttempt, setGenerationAttempt] = useState(0);

  const canTryDirectImage = useMemo(
    () => /^data:image\//i.test(value),
    [value],
  );
  const useDirectImage = canTryDirectImage && !directImageFailed;

  useEffect(() => {
    setDirectImageFailed(false);
    setGeneratedDataUrl(null);
    setGenerationFailed(false);
    setGenerationAttempt(0);
  }, [value]);

  useEffect(() => {
    if (canTryDirectImage) {
      setGeneratedDataUrl(null);
      setGenerationFailed(false);
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
  }, [canTryDirectImage, generationAttempt, value]);

  if (useDirectImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={value}
        alt={alt}
        width={320}
        height={320}
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
        width={320}
        height={320}
        className={cn(
          "mx-auto max-h-72 w-full max-w-72 object-contain",
          className,
        )}
      />
    );
  }

  if (directImageFailed || generationFailed) {
    return (
      <Alert
        variant="destructive"
        className={cn(
          "mx-auto min-h-48 w-full max-w-72 place-items-center gap-3 border-dashed p-4 text-center",
          className,
        )}
      >
        <AlertDescription className="text-sm">{errorMessage}</AlertDescription>
        <Button
          type="button"
          variant="outline"
          size="touch"
          onClick={() => {
            setDirectImageFailed(false);
            setGeneratedDataUrl(null);
            setGenerationFailed(false);
            setGenerationAttempt((current) => current + 1);
          }}
        >
          {retryLabel}
        </Button>
      </Alert>
    );
  }

  return <Skeleton className={cn("mx-auto size-48", className)} />;
}
