// @ts-expect-error - Deno JSR side-effect import (resolved at runtime in Supabase)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-expect-error - Deno JSR import (resolved at runtime in Supabase)
import { createClient } from "jsr:@supabase/supabase-js@2";

declare const Deno: {
  env: { get: (name: string) => string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function xmlOk(status = 200) {
  return new Response("<Response></Response>", {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

/**
 * Twilio MessageStatus values we care about, mapped to dispatch_logs.status.
 * https://www.twilio.com/docs/messaging/api/message-resource#message-status-values
 *
 * accepted/queued/sending → no-op (we already wrote 'sent' optimistically)
 * sent      → confirms left Twilio, keep status='sent'
 * delivered → set delivered_at, status='delivered'
 * read      → set read_at, status='read' (WhatsApp only)
 * failed/undelivered → status='failed', record error_msg
 */
function mapStatus(twilioStatus: string): {
  status: string | null;
  patch: Record<string, string>;
} {
  const now = new Date().toISOString();
  switch (twilioStatus) {
    case "delivered":
      return { status: "delivered", patch: { delivered_at: now } };
    case "read":
      return { status: "read", patch: { read_at: now } };
    case "sent":
      return { status: "sent", patch: {} };
    case "failed":
    case "undelivered":
      return { status: "failed", patch: {} };
    default:
      return { status: null, patch: {} };
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return xmlOk(405);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Supabase env not configured");
    return xmlOk(500);
  }

  const rawBody = await req.text();
  const params = new URLSearchParams(rawBody);

  const messageSid = params.get("MessageSid") ?? params.get("SmsSid");
  const messageStatus =
    params.get("MessageStatus") ?? params.get("SmsStatus") ?? "";
  const errorCode = params.get("ErrorCode");
  const errorMessage = params.get("ErrorMessage");

  if (!messageSid) {
    console.warn("twilio-status-webhook called without MessageSid");
    return xmlOk();
  }

  console.log("twilio status callback", {
    messageSid,
    messageStatus,
    errorCode,
  });

  const { status: nextStatus, patch } = mapStatus(messageStatus);
  if (!nextStatus) {
    // Unknown / transient status — just record provider_status for visibility.
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await supabase
      .from("dispatch_logs")
      .update({ provider_status: messageStatus })
      .eq("provider_message_id", messageSid);
    return xmlOk();
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Build the update payload. Don't downgrade a row that's already further
  // along the funnel: e.g., if we already saw 'read', don't overwrite with 'sent'.
  const STATUS_RANK: Record<string, number> = {
    queued: 0,
    sent: 1,
    delivered: 2,
    read: 3,
    replied: 4,
    failed: 99,
    undelivered: 99,
  };

  const { data: existing, error: fetchError } = await supabase
    .from("dispatch_logs")
    .select("id, status")
    .eq("provider_message_id", messageSid)
    .maybeSingle();

  if (fetchError) {
    console.error("dispatch_logs lookup failed:", fetchError);
    return xmlOk(500);
  }

  if (!existing) {
    console.warn("No dispatch_logs row for MessageSid:", messageSid);
    return xmlOk();
  }

  const currentRank = STATUS_RANK[existing.status as string] ?? -1;
  const nextRank = STATUS_RANK[nextStatus] ?? -1;

  const updatePayload: Record<string, unknown> = {
    provider_status: messageStatus,
    ...patch,
  };

  // Only advance status forward (failed always wins).
  if (nextStatus === "failed" || nextRank > currentRank) {
    updatePayload.status = nextStatus;
  }

  if (nextStatus === "failed") {
    const detail = [errorCode, errorMessage].filter(Boolean).join(": ");
    if (detail) updatePayload.error_msg = detail;
  }

  const { error: updateError } = await supabase
    .from("dispatch_logs")
    .update(updatePayload)
    .eq("id", existing.id);

  if (updateError) {
    console.error("dispatch_logs update failed:", updateError);
    return xmlOk(500);
  }

  return xmlOk();
});
