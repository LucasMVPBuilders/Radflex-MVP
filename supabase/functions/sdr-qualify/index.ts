import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function replaceAll(input: string, token: string, value: string) {
  return input.split(token).join(value);
}

function safeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function isSdrDecision(payload: any): payload is {
  decision: "qualified" | "desqualified";
  summary: string;
  reason: string;
  confidence?: number;
} {
  return (
    payload &&
    (payload.decision === "qualified" || payload.decision === "desqualified") &&
    typeof payload.summary === "string" &&
    typeof payload.reason === "string" &&
    (payload.confidence === undefined || typeof payload.confidence === "number")
  );
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ success: false, error: "Supabase env not configured" }, 500);
  }
  if (!OPENAI_API_KEY) {
    return jsonResponse({ success: false, error: "OPENAI_API_KEY not configured" }, 500);
  }

  let payload: any = null;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }

  const pipelineLeadId = payload?.pipelineLeadId as string | undefined;
  if (!pipelineLeadId) {
    return jsonResponse({ success: false, error: "Missing pipelineLeadId" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Prompt ativo
  const { data: promptRow, error: promptError } = await supabase
    .from("sdr_prompts")
    .select("prompt")
    .eq("is_active", true)
    .maybeSingle();

  if (promptError) {
    return jsonResponse({ success: false, error: promptError.message }, 500);
  }

  if (!promptRow?.prompt) {
    // SDR inativo; sem ação.
    return jsonResponse({ success: true, data: { skipped: true, reason: "no_active_prompt" } });
  }

  // Lead (snapshot + stage)
  const { data: lead, error: leadError } = await supabase
    .from("pipeline_leads")
    .select("id,current_stage_id,primary_channel,contact_phone,contact_email,lead_snapshot")
    .eq("id", pipelineLeadId)
    .maybeSingle();

  if (leadError) {
    return jsonResponse({ success: false, error: leadError.message }, 500);
  }
  if (!lead) {
    return jsonResponse({ success: false, error: "pipeline_lead not found" }, 404);
  }

  // Últimas mensagens
  const { data: messages, error: msgError } = await supabase
    .from("conversation_messages")
    .select("direction,body,created_at")
    .eq("pipeline_lead_id", pipelineLeadId)
    .order("created_at", { ascending: false })
    .limit(12);

  if (msgError) {
    return jsonResponse({ success: false, error: msgError.message }, 500);
  }

  const safeMessages = (messages ?? []) as Array<{
    direction: "inbound" | "outbound";
    body: string;
    created_at: string;
  }>;

  const messagesAsc = [...safeMessages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const latestInbound = [...messagesAsc].reverse().find((m) => m.direction === "inbound");
  const conversation = messagesAsc
    .map((m) => `${m.direction.toUpperCase()}: ${m.body}`)
    .join("\n");

  // Stage keys -> ids
  const { data: stages, error: stagesError } = await supabase
    .from("pipeline_stages")
    .select("id,key,name")
    .in("key", ["qualified", "desqualified"]);

  if (stagesError) {
    return jsonResponse({ success: false, error: stagesError.message }, 500);
  }

  const qualifiedStage = stages?.find((s: any) => s.key === "qualified");
  const desqualifiedStage = stages?.find((s: any) => s.key === "desqualified");

  if (!qualifiedStage || !desqualifiedStage) {
    return jsonResponse(
      { success: false, error: "Missing pipeline stage ids for qualified/desqualified" },
      500
    );
  }

  const leadSnapshot = (lead.lead_snapshot ?? {}) as any;
  const companyName = (leadSnapshot.companyName ?? "") as string;

  const currentStageName =
    (stages?.find((s: any) => s.id === lead.current_stage_id)?.name as string | undefined) ??
    "";

  // Preenche placeholders no prompt.
  const filledPrompt = replaceAll(
    replaceAll(
      replaceAll(
        replaceAll(promptRow.prompt, "{{companyName}}", companyName),
        "{{leadStage}}",
        currentStageName || String(lead.current_stage_id)
      ),
      "{{latestInboundMessage}}",
      latestInbound?.body ?? ""
    ),
    "{{conversation}}",
    conversation
  );

  // OpenAI (força JSON)
  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: filledPrompt,
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!openaiRes.ok) {
    const text = await openaiRes.text().catch(() => "");
    return jsonResponse(
      {
        success: false,
        error: `OpenAI error (${openaiRes.status}): ${text.slice(0, 500)}`,
      },
      500
    );
  }

  const openaiJson = await openaiRes.json();
  const content = openaiJson?.choices?.[0]?.message?.content;

  let decisionJson: any = null;
  try {
    decisionJson = typeof content === "string" ? JSON.parse(content) : null;
  } catch {
    decisionJson = null;
  }

  if (!decisionJson || !isSdrDecision(decisionJson)) {
    return jsonResponse(
      {
        success: false,
        error: "Invalid OpenAI JSON output",
        received: decisionJson,
      },
      500
    );
  }

  const now = new Date().toISOString();
  const targetStage = decisionJson.decision === "qualified" ? qualifiedStage : desqualifiedStage;

  const sdrLastJson = {
    decision: decisionJson.decision,
    confidence: safeNumber(decisionJson.confidence) ?? undefined,
    summary: decisionJson.summary,
    reason: decisionJson.reason,
  };

  const { error: updateError } = await supabase
    .from("pipeline_leads")
    .update({
      current_stage_id: targetStage.id,
      sdr_last_summary: decisionJson.summary,
      sdr_last_reason: decisionJson.reason,
      sdr_last_json: sdrLastJson,
      sdr_last_run_at: now,
    })
    .eq("id", pipelineLeadId);

  if (updateError) {
    return jsonResponse({ success: false, error: updateError.message }, 500);
  }

  return jsonResponse({
    success: true,
    data: {
      decision: decisionJson.decision,
      summary: decisionJson.summary,
      reason: decisionJson.reason,
      confidence: safeNumber(decisionJson.confidence) ?? undefined,
    },
  });
});

