import { Heart } from "lucide-react";
import { Card, CardContent } from "@comtammatu/ui/components/card";

export default function CrmPage() {
  return (
    <div className="space-y-5 lg:space-y-6">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="space-y-3">
            <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              Phân hệ ERP
            </span>
            <div className="space-y-2">
              <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Khách hàng
              </h2>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="border-dashed bg-muted/20">
        <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-full border bg-muted text-primary">
            <Heart className="size-8 text-primary" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-2xl font-semibold">
              Tính năng đang phát triển
            </h3>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
