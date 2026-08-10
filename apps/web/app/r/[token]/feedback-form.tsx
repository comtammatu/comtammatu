"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { Label } from "@comtammatu/ui/components/label";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { cn } from "@comtammatu/ui/lib/utils";
import {
  FEEDBACK_MUTATION_HEADER,
  FEEDBACK_RATING_MAX,
} from "@lib/feedback/contracts";
import { feedbackCopy } from "@lib/messages/feedback";

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function FeedbackForm({
  token,
  branchName,
  qrLabel,
  branchPhone,
  googleReviewUrl,
}: {
  token: string;
  branchName: string;
  qrLabel: string;
  branchPhone: string | null;
  googleReviewUrl: string | null;
}) {
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submittedRating, setSubmittedRating] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [clientSubmissionId] = useState(() => crypto.randomUUID());

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (rating == null) {
      setError(feedbackCopy.ratingRequired);
      return;
    }
    if (rating <= 3 && comment.trim().length === 0) {
      setError(feedbackCopy.commentRequired);
      return;
    }

    startTransition(async () => {
      const response = await fetch(`/api/feedback/${token}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [FEEDBACK_MUTATION_HEADER]: "1",
        },
        body: JSON.stringify({
          clientSubmissionId,
          rating,
          comment,
          website,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        code?: string;
        message?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        if (response.status === 429 || payload?.code === "rate_limited") {
          setError(feedbackCopy.rateLimited);
        } else {
          setError(payload?.message ?? feedbackCopy.submitFailed);
        }
        return;
      }

      setSubmittedRating(rating);
      setDone(true);
    });
  }

  const showGoogleCta =
    done &&
    submittedRating != null &&
    submittedRating >= 4 &&
    Boolean(googleReviewUrl);

  const showCallCta =
    done &&
    submittedRating != null &&
    submittedRating <= 3 &&
    Boolean(branchPhone);

  if (done) {
    return (
      <div className="flex flex-col gap-3 text-center">
        <h1 className="text-xl font-semibold">{feedbackCopy.guestThanks}</h1>
        <p className="text-muted-foreground">{feedbackCopy.guestThanksBody}</p>
        {showGoogleCta && googleReviewUrl ? (
          <>
            <p className="text-sm text-muted-foreground">
              {feedbackCopy.googleHint}
            </p>
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                window.open(googleReviewUrl, "_blank", "noopener,noreferrer");
              }}
            >
              {feedbackCopy.googleCta}
            </Button>
          </>
        ) : null}
        {showCallCta && branchPhone ? (
          <>
            <p className="text-sm text-muted-foreground">
              {feedbackCopy.callHint}
            </p>
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                window.location.href = telHref(branchPhone);
              }}
            >
              {feedbackCopy.callCta}
            </Button>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-xl font-semibold">{feedbackCopy.guestTitle}</h1>
        <p className="text-sm text-muted-foreground">
          {branchName}
          {qrLabel ? ` · ${qrLabel}` : null}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label>{feedbackCopy.ratingLabel}</Label>
        <div className="flex justify-center gap-2">
          {Array.from({ length: FEEDBACK_RATING_MAX }, (_, index) => {
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
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="feedback-comment">
          {rating != null && rating <= 3
            ? feedbackCopy.commentLabelRequired
            : feedbackCopy.commentLabel}
        </Label>
        <Textarea
          id="feedback-comment"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder={feedbackCopy.commentPlaceholder}
          maxLength={2000}
          rows={4}
          required={rating != null && rating <= 3}
        />
      </div>

      {/* Honeypot — visually hidden from guests */}
      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden>
        <label htmlFor="feedback-website">Website</label>
        <input
          id="feedback-website"
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

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? feedbackCopy.submitting : feedbackCopy.submit}
      </Button>
    </form>
  );
}
