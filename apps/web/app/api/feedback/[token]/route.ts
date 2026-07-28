import { NextResponse, type NextRequest } from "next/server";
import {
  feedbackSubmitRequestSchema,
  feedbackTokenSchema,
} from "@lib/feedback/contracts";
import { submitFeedbackRequest } from "@lib/feedback/server";
import {
  applyFeedbackPrivateHeaders,
  hashFeedbackClientIp,
  validateFeedbackMutationRequest,
} from "@lib/feedback/request-security";
import { feedbackCopy } from "@lib/messages/feedback";

function jsonError(status: number, code: string, message: string) {
  const response = NextResponse.json({ ok: false, code, message }, { status });
  applyFeedbackPrivateHeaders(response);
  return response;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: rawToken } = await params;
  const parsedToken = feedbackTokenSchema.safeParse(rawToken);
  if (!parsedToken.success) {
    return jsonError(404, "invalid_token", feedbackCopy.invalidToken);
  }

  if (!validateFeedbackMutationRequest(request)) {
    return jsonError(403, "forbidden", feedbackCopy.submitFailed);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(422, "invalid_body", feedbackCopy.submitFailed);
  }

  const parsed = feedbackSubmitRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(422, "invalid_body", feedbackCopy.submitFailed);
  }

  // Honeypot: pretend success without inserting.
  if (parsed.data.website && parsed.data.website.trim().length > 0) {
    const response = NextResponse.json({
      ok: true,
      feedbackId: 0,
      duplicate: false,
    });
    applyFeedbackPrivateHeaders(response);
    return response;
  }

  const ipHash = hashFeedbackClientIp(request);
  if (ipHash === null) {
    return jsonError(403, "forbidden", feedbackCopy.submitFailed);
  }

  const result = await submitFeedbackRequest({
    token: parsedToken.data,
    clientSubmissionId: parsed.data.clientSubmissionId,
    rating: parsed.data.rating,
    comment: parsed.data.comment,
    ipHash,
  });

  if (!result.ok) {
    const response = jsonError(result.status, result.code, result.message);
    if (result.status === 429 && result.retryAfterSeconds != null) {
      response.headers.set("Retry-After", String(result.retryAfterSeconds));
    }
    return response;
  }

  const response = NextResponse.json({
    ok: true,
    feedbackId: result.feedbackId,
    duplicate: result.duplicate,
  });
  applyFeedbackPrivateHeaders(response);
  return response;
}
