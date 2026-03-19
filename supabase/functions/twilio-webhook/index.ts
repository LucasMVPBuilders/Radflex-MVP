import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore - Deno JSR import (resolved at runtime in Supabase)
import { createClient } from "jsr:@supabase/supabase-js@2";

declare const Deno: {
  env: {
    get: (name: string) => string | undefined;
  };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return xmlResponse("<Response></Response>", 500);
  }

  const rawBody = await req.text();
  const params = new URLSearchParams(rawBody);

  const fromRaw = params.get("From") ?? "";
  const from = normalizePipelinePhone(fromRaw);
  const body = params.get("Body")?.trim() ?? "";
  const messageSid = params.get("MessageSid");
  const status = params.get("SmsStatus") ?? params.get("MessageStatus") ?? "received";

  console.log("Inbound webhook", { fromRaw, from, body: body.slice(0, 50), messageSid });

  if (!from || !body) {
    console.error("Missing from or body", { from, body });
    return xmlResponse("<Response></Response>");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Try exact match first, then fallback to suffix match for format variations
  let pipelineLead: { id: string; current_stage_id: string; unread_count: number } | null = null;

  const [
    { data: exactMatch, error: exactError },
    { data: repliedStage, error: repliedStageError },
    { data: finalStages },
  ] = await Promise.all([
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
    // Stages where SDR already made a final decision — don't reset back to "replied"
    supabase
      .from("pipeline_stages")
      .select("id")
      .in("key", ["qualified", "desqualified"]),
  ]);

  if (exactError) {
    console.error("Error querying pipeline_leads", exactError);
    return xmlResponse("<Response></Response>", 500);
  }

  pipelineLead = exactMatch;

  // Fallback: match by digits suffix (last 11 digits) to handle format mismatches
  if (!pipelineLead) {
    const digits = from.replace(/\D/g, "").slice(-11);
    console.log("Exact match failed, trying suffix match", { digits });
    const { data: suffixMatch } = await supabase
      .from("pipeline_leads")
      .select("id, current_stage_id, unread_count")
      .like("contact_phone", `%${digits}`)
      .maybeSingle();
    pipelineLead = suffixMatch;
  }

  if (repliedStageError || !pipelineLead) {
    console.error("No pipeline_lead found", { from, repliedStageError });
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

  const finalStageIds = new Set((finalStages ?? []).map((s: any) => s.id));
  const isAlreadyFinalized = finalStageIds.has(pipelineLead.current_stage_id);

  if (repliedStage && !isAlreadyFinalized && pipelineLead.current_stage_id !== repliedStage.id) {
    updatePayload.current_stage_id = repliedStage.id;
  }

  const { error: updateError } = await supabase
    .from("pipeline_leads")
    .update(updatePayload)
    .eq("id", pipelineLead.id);

  if (updateError) {
    return xmlResponse("<Response></Response>", 500);
  }

  // SDR: skip leads already finalized (qualified / desqualified) to prevent re-qualification.
  if (!isAlreadyFinalized) void fetch(`${SUPABASE_URL}/functions/v1/sdr-qualify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ pipelineLeadId: pipelineLead.id }),
  })
    .then(async (sdrRes) => {
      if (!sdrRes.ok) {
        const text = await sdrRes.text().catch(() => "");
        console.error("sdr-qualify call failed", sdrRes.status, text.slice(0, 300));
      }
    })
    .catch((e) => console.error("sdr-qualify call error:", e));

  return xmlResponse("<Response></Response>");
});
