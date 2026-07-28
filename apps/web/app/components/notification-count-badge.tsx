/**
 * Unread-count bubble for a notification bell trigger.
 *
 * Canonical geometry is the owner-approved OVERHANG: `-right-1 -top-1` with
 * `leading-none`, so the count reads as an attached bubble instead of clipping
 * the bell glyph. Both the operator and employee headers consume this so the
 * offset can no longer diverge. Renders nothing when `count <= 0`.
 *
 * The bubble is decorative: the accessible count is merged into the bell
 * button's `aria-label` by the caller, so screen readers announce
 * "Thông báo, 3 chưa đọc" instead of a stray digit.
 */
export function NotificationCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <span
      aria-hidden="true"
      className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-2xs font-semibold leading-none text-destructive-foreground"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
