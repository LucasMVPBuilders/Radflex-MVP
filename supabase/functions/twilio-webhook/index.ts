import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return result === 0;
}

function normalizePipelinePhone(value: string | null) {
  if (!value) {
    return null;
  }

  const withoutPrefix = value.replace(/^whatsapp:/i, "").trim();
  const digits = withoutPrefix.replace(/\D/g, "");

  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }

  if (digits.length === 12 || digits.length === 13) {
    return `+${digits}`;
  }

  return withoutPrefix.startsWith("+") ? withoutPrefix : null;
}

async function computeTwilioSignature(url: string, params: URLSearchParams) {
  const payload = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .reduce((accumulator, [key, value]) => accumulator + key + value, url);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(TWILIO_AUTH_TOKEN),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(payload)
  );

  return toBase64(new Uint8Array(signature));
}

function xmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return xmlResponse("<Response></Response>", 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TWILIO_AUTH_TOKEN) {
    return xmlResponse("<Response></Response>", 500);
  }

  const rawBody = await req.text();
  const params = new URLSearchParams(rawBody);
  const twilioSignature = req.headers.get("x-twilio-signature") ?? "";
  const expectedSignature = await computeTwilioSignature(req.url, params);

  if (!timingSafeEqual(twilioSignature, expectedSignature)) {
    return xmlResponse("<Response></Response>", 401);
  }

  const from = normalizePipelinePhone(params.get("From"));
  const body = params.get("Body")?.trim() ?? "";
  const messageSid = params.get("MessageSid");
  const status = params.get("SmsStatus") ?? params.get("MessageStatus") ?? "received";

  if (!from || !body) {
    return xmlResponse("<Response></Response>");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [{ data: pipelineLead, error: pipelineLeadError }, { data: repliedStage, error: repliedStageError }] =
    await Promise.all([
      supabase
        .from("pipeline_leads")
        .select("id, current_stage_id, unread_count")
        .eq("contact_phone", from)
        .maybeSingle(),
      supabase
        .from("pipeline_stages")
        .select("id")
        .eq("key", "replied")
        .maybeSingle(),
    ]);

  if (pipelineLeadError || repliedStageError || !pipelineLead) {
    return xmlResponse("<Response></Response>");
  }

  const { error: messageError } = await supabase
    .from("conversation_messages")
    .upsert(
      {
        pipeline_lead_id: pipelineLead.id,
        channel: "whatsapp",
        direction: "inbound",
        provider_message_id: messageSid,
        body,
        status,
        metadata: {
          from,
          to: params.get("To"),
          profileName: params.get("ProfileName"),
        },
      },
      {
        onConflict: "provider_message_id",
      }
    );

  if (messageError) {
    return xmlResponse("<Response></Response>", 500);
  }

  const updatePayload: Record<string, unknown> = {
    latest_message_preview: body,
    latest_message_at: new Date().toISOString(),
    latest_direction: "inbound",
    unread_count: Number(pipelineLead.unread_count ?? 0) + 1,
  };

  if (repliedStage && pipelineLead.current_stage_id !== repliedStage.id) {
    updatePayload.current_stage_id = repliedStage.id;
  }

  const { error: updateError } = await supabase
    .from("pipeline_leads")
    .update(updatePayload)
    .eq("id", pipelineLead.id);

  if (updateError) {
    return xmlResponse("<Response></Response>", 500);
  }

  return xmlResponse("<Response></Response>");
});
