import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { isValidFeedbackToken } from "@comtammatu/shared/feedback";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { Button } from "@comtammatu/ui/components/button";

interface ThankYouPageProps {
  params: Promise<{ token: string }>;
}

export default async function ThankYouPage({ params }: ThankYouPageProps) {
  const { token } = await params;

  // Phishing gate: any /r/<bogus>/thank-you used to render the branded
  // "Cảm ơn" card. Mirror /r/[token]/page.tsx token check so attackers
  // can't fabricate trust signals via shareable URLs.
  if (!isValidFeedbackToken(token)) {
    notFound();
  }
  const supabase = createServiceClient();
  const { data: qrCode } = await supabase
    .from("feedback_qr_codes")
    .select("id")
    .eq("token", token)
    .eq("is_active", true)
    .maybeSingle();
  if (!qrCode) {
    notFound();
  }

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
