"use client";

import { useTransition, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { submitFeedbackClientSchema } from "@comtammatu/shared/feedback";
import type { SubmitFeedbackInput } from "@comtammatu/shared/feedback";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Button } from "@comtammatu/ui/components/button";
import { TextField } from "@/components/form/text-field";
import { TextareaField } from "@/components/form/textarea-field";
import { RatingEmojiPicker } from "./rating-emoji-picker";
import { submitFeedback } from "../actions";
import { uploadFeedbackPhotos } from "../actions-photos";

const MAX_PHOTOS = 3;
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

interface FeedbackFormProps {
  token: string;
  branchName: string;
  qrLabel: string;
}

export function FeedbackForm({ token, branchName, qrLabel }: FeedbackFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rootError, setRootError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    control,
    handleSubmit,
    register,
  } = useForm<SubmitFeedbackInput>({
    resolver: zodResolver(submitFeedbackClientSchema),
    defaultValues: {
      website: "",
      rating: undefined as unknown as number,
      comment: "",
      phone: "",
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    const valid: File[] = [];
    for (const f of selected) {
      if (!ACCEPTED_TYPES.includes(f.type)) continue;
      if (f.size > MAX_BYTES) continue;
      valid.push(f);
    }
    setFiles((prev) => {
      const merged = [...prev, ...valid];
      return merged.slice(0, MAX_PHOTOS);
    });
    // Reset input so same file can be re-added after removal
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function onSubmit(data: SubmitFeedbackInput) {
    setRootError(null);
    startTransition(async () => {
      const result = await submitFeedback(data, { token });
      if (!result.success) {
        if (result.errorCode === "rate_limited") {
          setRootError("Bạn đã gửi nhiều phản ánh, vui lòng thử lại sau.");
        } else {
          setRootError(result.error ?? "Có lỗi xảy ra, vui lòng thử lại.");
        }
        return;
      }

      // Upload photos if any, block redirect until done.
      // token is passed for ownership validation (anti-IDOR on photo upload).
      const feedbackId = result.data?.feedback_id;
      if (files.length > 0 && feedbackId) {
        const formData = new FormData();
        for (const f of files) {
          formData.append("photos", f);
        }
        await uploadFeedbackPhotos(formData, feedbackId, token);
      }

      router.push(`/r/${token}/thank-you`);
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div className="mb-2">
        <p className="text-sm text-muted-foreground">{branchName}</p>
        <p className="text-xs text-muted-foreground">{qrLabel}</p>
      </div>

      {rootError ? (
        <Alert variant="destructive">
          <AlertDescription>{rootError}</AlertDescription>
        </Alert>
      ) : null}

      <RatingEmojiPicker control={control} name="rating" required />

      <TextareaField
        control={control}
        name="comment"
        label="Nhận xét"
        placeholder="Chia sẻ trải nghiệm của bạn..."
        required
      />

      <TextField
        control={control}
        name="phone"
        label="Số điện thoại (tuỳ chọn)"
        type="tel"
        placeholder="0912 345 678"
        description="Số điện thoại là tuỳ chọn, chỉ dùng để liên hệ xử lý phản ánh."
      />

      {/* Photo upload */}
      <div className="space-y-2">
        <p className="text-sm font-medium">
          Ảnh đính kèm{" "}
          <span className="text-muted-foreground font-normal">(tuỳ chọn, tối đa 3 ảnh)</span>
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/heic"
          onChange={handleFileChange}
          disabled={files.length >= MAX_PHOTOS || isPending}
          className="sr-only"
          id="photo-upload"
          aria-label="Chọn ảnh đính kèm"
        />
        {files.length < MAX_PHOTOS ? (
          <label htmlFor="photo-upload">
            <Button
              type="button"
              variant="outline"
              size="sm"
              asChild
              disabled={isPending}
            >
              <span>Thêm ảnh ({files.length}/{MAX_PHOTOS})</span>
            </Button>
          </label>
        ) : null}
        {files.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {files.map((f, i) => {
              const url = URL.createObjectURL(f);
              return (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={f.name}
                    className="size-16 rounded-md border object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    disabled={isPending}
                    aria-label={`Xoá ảnh ${f.name}`}
                    className="bg-destructive text-destructive-foreground absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full text-xs"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Honeypot — sr-only keeps it off-screen for humans, bots can still fill it */}
      <input
        {...register("website")}
        type="text"
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        autoComplete="off"
      />

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Đang gửi..." : "Gửi phản ánh"}
      </Button>
    </form>
  );
}
