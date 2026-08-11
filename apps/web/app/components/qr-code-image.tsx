"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import { cn } from "@comtammatu/ui";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Button } from "@comtammatu/ui/components/button";
import { Skeleton } from "@comtammatu/ui/components/skeleton";

import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
interface QrCodeImageProps {
  value: string;
  alt: string;
  className?: string;
  errorMessage?: string;
  retryLabel?: string;
  children?: ReactNode;
  downloadLabel?: string;
  downloadName?: string;
}

export function QrCodeImage({
  value,
  alt,
  className,
  errorMessage = "Không thể hiển thị mã QR.",
  retryLabel = "Thử lại",
  children,
  downloadLabel,
  downloadName,
}: QrCodeImageProps) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);

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

  const imageSource = useDirectImage
    ? value
    : generatedDataUrl && !generationFailed
      ? generatedDataUrl
      : null;

  if (imageSource) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSource}
          alt={alt}
          width={320}
          height={320}
          className={cn(
            "mx-auto max-h-72 w-full max-w-72 object-contain",
            className,
          )}
          onError={() => {
            if (useDirectImage) setDirectImageFailed(true);
            else setGenerationFailed(true);
          }}
        />
        {children || (downloadLabel && downloadName) ? (
          <div
            className={cn(
              "grid w-full gap-2",
              children && downloadLabel && downloadName
                ? "grid-cols-2"
                : "grid-cols-1",
            )}
          >
            {children}
            {downloadLabel && downloadName ? (
              <Button
                type="button"
                variant="outline"
                size={isTouchLayout ? "touch" : "default"}
                render={<a href={imageSource} download={downloadName} />}
              >
                {downloadLabel}
              </Button>
            ) : null}
          </div>
        ) : null}
      </>
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
          size={isTouchLayout ? "touch" : "default"}
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
