// @ts-expect-error - Deno JSR side-effect import (resolved at runtime in Supabase)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-expect-error - Deno JSR import (resolved at runtime in Supabase)
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

  // Try exact match first, then fallback to suffix match for format variations.
  // If neither hits, create a brand new pipeline_lead in `inbound_organic` so
  // organic inbound (wa.me link, ad clicks, leads outside our dispatch list)
  // doesn't get silently dropped.
  let pipelineLead: { id: string; current_stage_id: string; unread_count: number } | null = null;
  let wasJustCreated = false;

  const [
    { data: exactMatch, error: exactError },
    { data: repliedStage, error: repliedStageError },
    { data: finalStages },
    { data: organicStage },
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
    supabase
      .from("pipeline_stages")
      .select("id")
      .eq("key", "inbound_organic")
      .maybeSingle(),
  ]);

  if (exactError) {
    console.error("Error querying pipeline_leads", exactError);
    return xmlResponse("<Response></Response>", 500);
  }

  if (repliedStageError) {
    console.error("Error querying replied stage", repliedStageError);
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

  // Auto-create lead for organic inbound when no match exists.
  // Guard: skip very short bodies (< 4 chars) to reduce noise from bots/probes
  // — legitimate first messages are almost always longer ("Olá", "Quero saber..."
  // etc. are 3+ chars; we use 4 to filter "oi", single emojis, and similar).
  if (!pipelineLead) {
    if (body.length < 4) {
      console.log("Inbound from unknown number with short body, skipping auto-create", {
        from,
        bodyLength: body.length,
      });
      return xmlResponse("<Response></Response>");
    }

    if (!organicStage) {
      console.error("inbound_organic stage not found — migration not applied?", { from });
      return xmlResponse("<Response></Response>");
    }

    const profileName = params.get("ProfileName")?.trim() || null;
    const displayName = profileName
      ? `${profileName} (WhatsApp)`
      : `Lead WhatsApp ${from}`;

    const { data: newLead, error: createError } = await supabase
      .from("pipeline_leads")
      .insert({
        lead_id: `inbound:${from}:${Date.now()}`,
        current_stage_id: organicStage.id,
        primary_channel: "whatsapp",
        contact_phone: from,
        contact_email: null,
        unread_count: 0,
        lead_snapshot: {
          companyName: displayName,
          phone: from,
          email: "",
          city: "",
          state: "",
          cnae: "",
          source: "inbound_organic",
        },
      })
      .select("id, current_stage_id, unread_count")
      .single();

    if (createError) {
      console.error("Failed to create inbound_organic lead", { from, error: createError });
      return xmlResponse("<Response></Response>", 500);
    }

    pipelineLead = newLead;
    wasJustCreated = true;
    console.log("Auto-created inbound_organic lead", { from, leadId: newLead.id });
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

  // Don't auto-move to "replied" if we just created the lead (it stays in
  // inbound_organic until SDR or human moves it).
  if (
    !wasJustCreated &&
    repliedStage &&
    !isAlreadyFinalized &&
    pipelineLead.current_stage_id !== repliedStage.id
  ) {
    updatePayload.current_stage_id = repliedStage.id;
  }

  const { error: updateError } = await supabase
    .from("pipeline_leads")
    .update(updatePayload)
    .eq("id", pipelineLead.id);

  if (updateError) {
    return xmlResponse("<Response></Response>", 500);
  }

  // Stamp replied_at on the most recent dispatch_logs row for this contact so
  // the Histórico screen can show reply rates. Best-effort — don't fail the
  // webhook if this update errors out.
  void supabase
    .from("dispatch_logs")
    .select("id")
    .eq("contact_value", from)
    .eq("channel", "whatsapp")
    .in("status", ["sent", "delivered", "read"])
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle()
    .then(async ({ data, error }: { data: { id: string } | null; error: unknown }) => {
      if (error || !data) return;
      await supabase
        .from("dispatch_logs")
        .update({
          replied_at: new Date().toISOString(),
          status: "replied",
        })
        .eq("id", data.id);
    });

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
