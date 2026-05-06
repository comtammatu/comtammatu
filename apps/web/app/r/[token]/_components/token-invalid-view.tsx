import { Card, CardContent, CardHeader, CardTitle } from "@comtammatu/ui/components/card";

export function TokenInvalidView() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-warning">
          <span aria-hidden="true">⚠️</span>
          QR đã được làm mới
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">
          Vui lòng quét lại QR mới ở bàn.
        </p>
      </CardContent>
    </Card>
  );
}
