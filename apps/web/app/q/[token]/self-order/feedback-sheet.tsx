"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Button } from "@comtammatu/ui/components/button";
import { Label } from "@comtammatu/ui/components/label";

import { Textarea } from "@comtammatu/ui/components/textarea";
import { cn } from "@comtammatu/ui/lib/utils";
import { StationSheet } from "@/components/surface";


export type PaidOrderFeedbackContext = {
  orderId: number;
  orderNumber: string;
  tableNumber: number;
  branchPhone: string | null;
  googleReviewUrl: string | null;
};

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function SelfOrderFeedbackSheet({
  open,
  onOpenChange,
  token,
  orderContext,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  orderContext: PaidOrderFeedbackContext | null;
  onSubmitted: () => void;
}) {
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submittedRating, setSubmittedRating] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [clientSubmissionId] = useState(() => crypto.randomUUID());

  const quickTags =
    rating != null
      ? rating >= 4
        ? [
            "Món ăn ngon",
            "Phục vụ chu đáo",
            "Lên món nhanh",
            "Không gian sạch sẽ",
            "Giá cả hợp lý",
          ]
        : [
            "Lên món chậm",
            "Thức ăn nguội",
            "Phục vụ chưa tốt",
            "Bàn chưa dọn sạch",
            "Sai món",
          ]
      : [];

  function handleToggleTag(tag: string) {
    setComment((current) => {
      const trimmed = current.trim();
      if (!trimmed) return tag;
      if (trimmed.includes(tag)) {
        return trimmed
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s !== tag && s.length > 0)
          .join(", ");
      }
      return `${trimmed}, ${tag}`;
    });
  }

  function resetLocal() {
    setRating(null);
    setComment("");
    setWebsite("");
    setError(null);
    setDone(false);
    setSubmittedRating(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetLocal();
    onOpenChange(next);
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (rating == null) {
      setError(SELF_ORDER_VI.feedbackRatingRequired);
      return;
    }
    if (rating <= 3 && comment.trim().length === 0) {
      setError(SELF_ORDER_VI.feedbackCommentRequired);
      return;
    }
    if (!orderContext) {
      setError(SELF_ORDER_VI.feedbackOrderMissing);
      return;
    }

    startTransition(async () => {
      const response = await fetch(
        `/api/self-order/${encodeURIComponent(token)}/feedback`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-self-order-request": "1",
          },
          body: JSON.stringify({
            clientSubmissionId,
            orderId: orderContext.orderId,
            rating,
            comment,
            website,
          }),
        },
      );

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        code?: string;
        message?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        if (response.status === 429 || payload?.code === "rate_limited") {
          setError(SELF_ORDER_VI.feedbackRateLimited);
        } else if (payload?.code === "already_submitted") {
          setError(SELF_ORDER_VI.feedbackAlreadySubmitted);
        } else {
          setError(payload?.message ?? SELF_ORDER_VI.feedbackFailed);
        }
        return;
      }

      setSubmittedRating(rating);
      setDone(true);
      onSubmitted();
    });
  }

  const metaParts = orderContext
    ? [
        SELF_ORDER_VI.feedbackMetaOrder.replace(
          "{orderNumber}",
          orderContext.orderNumber,
        ),
        SELF_ORDER_VI.feedbackMetaTable.replace(
          "{tableNumber}",
          String(orderContext.tableNumber),
        ),
      ]
    : [];

  const showGoogleCta =
    done &&
    submittedRating != null &&
    submittedRating >= 4 &&
    Boolean(orderContext?.googleReviewUrl);

  const showCallCta =
    done &&
    submittedRating != null &&
    submittedRating <= 3 &&
    Boolean(orderContext?.branchPhone);

  return (
    <StationSheet
      open={open}
      onOpenChange={handleOpenChange}
      title={SELF_ORDER_VI.feedbackTitle}
      description={metaParts.length > 0 ? metaParts.join(" · ") : undefined}
      side="bottom"
      contentClassName="mx-auto max-h-[90dvh] w-full max-w-lg rounded-t-2xl"
    >
        {done ? (
          <div className="flex flex-col gap-3 text-center">
            <p className="text-lg font-semibold">
              {SELF_ORDER_VI.feedbackThanksTitle}
            </p>
            <p className="text-sm text-muted-foreground">
              {SELF_ORDER_VI.feedbackThanksBody}
            </p>
            {showGoogleCta && orderContext?.googleReviewUrl ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {SELF_ORDER_VI.feedbackGoogleHint}
                </p>
                <Button
                  type="button"
                  size="touch"
                  className="w-full"
                  onClick={() => {
                    window.open(
                      orderContext.googleReviewUrl!,
                      "_blank",
                      "noopener,noreferrer",
                    );
                  }}
                >
                  {SELF_ORDER_VI.feedbackGoogleCta}
                </Button>
              </>
            ) : null}
            {showCallCta && orderContext?.branchPhone ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {SELF_ORDER_VI.feedbackCallHint}
                </p>
                <Button
                  type="button"
                  size="touch"
                  className="w-full"
                  onClick={() => {
                    window.location.href = telHref(orderContext.branchPhone!);
                  }}
                >
                  {SELF_ORDER_VI.feedbackCallCta}
                </Button>
              </>
            ) : null}
            <Button
              type="button"
              size="touch"
              variant={showGoogleCta || showCallCta ? "outline" : "default"}
              className="mt-2 w-full"
              onClick={() => handleOpenChange(false)}
            >
              {SELF_ORDER_VI.paymentCompletedClose}
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label>{SELF_ORDER_VI.feedbackRatingLabel}</Label>
              <div className="flex justify-center gap-2">
                {Array.from({ length: 5 }, (_, index) => {
                  const value = index + 1;
                  const active = rating != null && value <= rating;
                  return (
                    <Button
                      key={value}
                      type="button"
                      variant="ghost"
                      size="icon-lg"
                      aria-label={`${value} sao`}
                      className={cn(
                        active ? "text-primary" : "text-muted-foreground",
                      )}
                      onClick={() => setRating(value)}
                    >
                      <Star
                        className={cn("size-8", active && "fill-current")}
                        aria-hidden
                      />
                    </Button>
                  );
                })}
              </div>

              {rating != null && quickTags.length > 0 ? (
                <div
                  className="flex flex-wrap justify-center gap-1.5 pt-1"
                  role="group"
                  aria-label={SELF_ORDER_VI.feedbackTagsAria}
                >
                  {quickTags.map((tag) => {
                    const isSelected = comment.includes(tag);
                    return (
                      <Button
                        key={tag}
                        type="button"
                        variant={isSelected ? "secondary" : "outline"}
                        size="sm"
                        className={cn(
                          "h-7 rounded-full px-3 text-xs font-normal",
                          isSelected &&
                            "border-primary/20 bg-primary/10 font-medium text-primary hover:bg-primary/15",
                        )}
                        onClick={() => handleToggleTag(tag)}
                      >
                        {tag}
                      </Button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="self-order-feedback-comment">
                {rating != null && rating <= 3
                  ? SELF_ORDER_VI.feedbackCommentLabelRequired
                  : SELF_ORDER_VI.feedbackCommentLabel}
              </Label>
              <Textarea
                id="self-order-feedback-comment"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder={SELF_ORDER_VI.feedbackCommentPlaceholder}
                maxLength={2000}
                rows={4}
                required={rating != null && rating <= 3}
              />
            </div>

            <div
              className="absolute -left-[9999px] h-0 w-0 overflow-hidden"
              aria-hidden
            >
              <label htmlFor="self-order-feedback-website">Website</label>
              <input
                id="self-order-feedback-website"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
              />
            </div>

            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Button
              type="submit"
              size="touch"
              className="w-full"
              disabled={isPending || !orderContext}
            >
              {isPending
                ? SELF_ORDER_VI.feedbackSubmitting
                : SELF_ORDER_VI.feedbackSubmit}
            </Button>
          </form>
        )}
    </StationSheet>
  );
}
