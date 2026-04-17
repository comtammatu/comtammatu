import { Card, CardContent } from "@comtammatu/ui/components/card";
import { StatementsClient } from "./statements-client";

export default function StatementsPage() {
  return (
    <div className="space-y-5 lg:space-y-6">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="space-y-3">
            <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              Tài chính
            </span>
            <div className="space-y-2">
              <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Báo cáo tài chính
              </h2>
            </div>
          </div>
        </CardContent>
      </Card>
      <StatementsClient />
    </div>
  );
}
