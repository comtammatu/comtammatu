"use client";

import { useEffect, useState } from "react";
import { Button } from "@comtammatu/ui/components/button";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";
import { StationSheet } from "@/components/surface";
import { QuickReasonChips } from "../quick-reason-chips";
import { ORDER_NOTE_PRESETS } from "../quick-reason-presets";

interface EditOrderNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentNote: string | null;
  orderNumber?: string | null;
  isPending?: boolean;
  onSubmit: (note: string) => void;
}

const MAX_NOTE_LENGTH = 300;

export function EditOrderNoteDialog({
  open,
  onOpenChange,
  currentNote,
  orderNumber,
  isPending = false,
  onSubmit,
}: EditOrderNoteDialogProps) {
  const [note, setNote] = useState<string>("");

  useEffect(() => {
    if (open) {
      setNote(currentNote ?? "");
    }
  }, [open, currentNote]);

  const hasExistingNote = Boolean(currentNote && currentNote.trim().length > 0);
  const trimmed = note.trim();
  const isChanged = trimmed !== (currentNote?.trim() ?? "");
  const canSave = !isPending && note.length <= MAX_NOTE_LENGTH;

  const handleClose = () => {
    if (isPending) return;
    onOpenChange(false);
  };

  const handleSave = () => {
    if (!canSave) return;
    onSubmit(trimmed);
  };

  const handleClear = () => {
    if (isPending) return;
    onSubmit("");
  };

  const title = `${messages.pos.orderDetail.orderNoteDialogTitle}${orderNumber ? ` · ${orderNumber}` : ""}`;

  return (
    <StationSheet
      open={open}
      onOpenChange={(nextOpen) => !nextOpen && handleClose()}
      title={title}
      side="bottom"
      size="md"
      footer={
        <>
          {hasExistingNote && (
            <Button
              type="button"
              variant="outline"
              size="touch"
              disabled={isPending}
              onClick={handleClear}
              className="text-destructive hover:bg-destructive/10 sm:mr-auto"
            >
              {messages.pos.orderDetail.clearNote}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="touch"
            disabled={isPending}
            onClick={handleClose}
          >
            {ACTIONS_VI.cancel}
          </Button>
          <Button
            type="button"
            size="touch"
            disabled={!canSave || (!isChanged && hasExistingNote)}
            onClick={handleSave}
          >
            {messages.pos.orderDetail.saveNote}
          </Button>
        </>
      }
    >
      <FieldGroup className="py-2">
        <Field>
          <FieldLabel htmlFor="edit-order-note">
            {messages.pos.orderDetail.noteLabel}
          </FieldLabel>
          <Textarea
            id="edit-order-note"
            rows={3}
            value={note}
            maxLength={MAX_NOTE_LENGTH}
            placeholder={messages.pos.orderDetail.orderNotePlaceholder}
            onChange={(e) => setNote(e.target.value)}
            disabled={isPending}
            className="resize-none"
          />
          <div className="flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
            <span>{messages.pos.orderDetail.orderNotePresetsHint}</span>
            <span className={note.length > MAX_NOTE_LENGTH ? "text-destructive font-medium" : ""}>
              {note.length}/{MAX_NOTE_LENGTH}
            </span>
          </div>
          <div className="pt-2">
            <QuickReasonChips
              presets={ORDER_NOTE_PRESETS}
              value={note}
              onChange={setNote}
              ariaLabel={messages.pos.orderDetail.orderNoteDialogTitle}
            />
          </div>
        </Field>
      </FieldGroup>
    </StationSheet>
  );
}
