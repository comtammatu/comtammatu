import Link from "next/link";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { AppEmptyState } from "@/components/surface";
import { BranchOperatorPanel } from "@lib/branch-operator/components/branch-operator-page";
import { FEEDBACK_PAGE_SIZE } from "@lib/feedback/contracts";
import type { FeedbackInboxRow } from "@/(protected)/feedback/actions";
import { feedbackCopy } from "@lib/messages/feedback";

export function BranchFeedbackInboxList({
  items,
  total,
  page,
  basePath,
}: {
  items: FeedbackInboxRow[];
  total: number;
  page: number;
  basePath: string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / FEEDBACK_PAGE_SIZE));
  const showPager = total > FEEDBACK_PAGE_SIZE;
  const prevHref = page <= 2 ? basePath : `${basePath}?page=${page - 1}`;
  const nextHref = `${basePath}?page=${page + 1}`;

  if (items.length === 0) {
    return (
      <AppEmptyState compact title={feedbackCopy.inboxEmpty} symbol="riceGrain" />
    );
  }

  return (
    <>
      <BranchOperatorPanel contentFlush>
        <ItemGroup className="gap-2">
          {items.map((item) => (
            <Item key={item.id} variant="outline" size="sm" className="min-h-12">
              <ItemContent className="min-w-0 gap-1">
                <ItemTitle className="text-sm font-medium">
                  {feedbackCopy.rating}: {item.rating}
                </ItemTitle>
                <ItemDescription>
                  {formatVNDateTime(item.createdAt)}
                </ItemDescription>
                {item.orderNumber || item.tableNumber ? (
                  <ItemDescription>
                    {[
                      item.orderNumber
                        ? `${feedbackCopy.orderNumber} ${item.orderNumber}`
                        : null,
                      item.tableNumber
                        ? feedbackCopy.tableLabel.replace(
                            "{number}",
                            item.tableNumber,
                          )
                        : null,
                      item.orderCreatedAt
                        ? formatVNDateTime(item.orderCreatedAt)
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </ItemDescription>
                ) : null}
                <ItemDescription className="line-clamp-3">
                  {item.comment ?? "—"}
                </ItemDescription>
                <ItemDescription>
                  {feedbackCopy.tabQr}: {item.qrLabel}
                </ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      </BranchOperatorPanel>

      {showPager ? (
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="touch"
            disabled={page <= 1}
            render={page <= 1 ? undefined : <Link href={prevHref} />}
          >
            {ACTIONS_VI.prevPage}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="touch"
            disabled={page >= pageCount}
            render={page >= pageCount ? undefined : <Link href={nextHref} />}
          >
            {ACTIONS_VI.nextPage}
          </Button>
        </div>
      ) : null}
    </>
  );
}
