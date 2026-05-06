import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@comtammatu/ui/components/card";
import { Button } from "@comtammatu/ui/components/button";

interface ThankYouPageProps {
  params: Promise<{ token: string }>;
}

export default async function ThankYouPage({ params }: ThankYouPageProps) {
  const { token } = await params;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-success">
          <span aria-hidden="true">✓</span>
          Cảm ơn bạn đã góp ý!
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Chúng tôi đã nhận được phản ánh của bạn và sẽ cải thiện dịch vụ.
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link href={`/r/${token}`}>Gửi phản ánh khác</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
