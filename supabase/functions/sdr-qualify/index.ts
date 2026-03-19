import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore - Deno JSR import (resolved at runtime in Supabase)
import { createClient } from "jsr:@supabase/supabase-js@2";

declare const Deno: {
  env: { get: (name: string) => string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

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

function isSdrResponse(payload: any): payload is {
  isFinal: boolean;
  decision?: "qualified" | "desqualified";
  nextMessage: string | null;
  summary: string;
  reason: string;
  confidence?: number;
} {
  if (!payload) return false;
  if (typeof payload.isFinal !== "boolean") return false;
  if (payload.decision !== undefined && payload.decision !== null) {
    if (payload.decision !== "qualified" && payload.decision !== "desqualified") return false;
  }
  if (typeof payload.nextMessage !== "string" && payload.nextMessage !== null) return false;
  if (typeof payload.summary !== "string") return false;
  if (typeof payload.reason !== "string") return false;
  if (payload.confidence !== undefined && typeof payload.confidence !== "number") return false;

  if (payload.isFinal) {
    return payload.decision === "qualified" || payload.decision === "desqualified";
  }

  return true;
}

function getProviderMessageId(fromSendResult: any): string | null {
  const sid = fromSendResult?.sid;
  return typeof sid === "string" ? sid : null;
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

  // Stage keys -> ids (includes lead's current stage so {{leadStage}} placeholder is populated)
  const { data: stages, error: stagesError } = await supabase
    .from("pipeline_stages")
    .select("id,key,name")
    .or(`key.in.(qualified,desqualified,sdr_talking),id.eq.${lead.current_stage_id}`);

  if (stagesError) {
    return jsonResponse({ success: false, error: stagesError.message }, 500);
  }

  const qualifiedStage = stages?.find((s: any) => s.key === "qualified");
  const desqualifiedStage = stages?.find((s: any) => s.key === "desqualified");
  const sdrTalkingStage = stages?.find((s: any) => s.key === "sdr_talking");

  if (!qualifiedStage || !desqualifiedStage || !sdrTalkingStage) {
    return jsonResponse(
      { success: false, error: "Missing pipeline stage ids for SDR flow" },
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
          role: "system",
          content:
            "Responda SOMENTE com JSON válido (sem texto extra) no formato: {\"isFinal\": boolean, \"decision\": \"qualified\"|\"desqualified\" (somente quando isFinal=true), \"nextMessage\": string|null, \"summary\": string, \"reason\": string, \"confidence\": number opcional}.",
        },
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

  let sdrJson: any = null;
  try {
    sdrJson = typeof content === "string" ? JSON.parse(content) : null;
  } catch {
    sdrJson = null;
  }

  if (!sdrJson || !isSdrResponse(sdrJson)) {
    return jsonResponse(
      {
        success: false,
        error: "Invalid OpenAI JSON output",
        received: sdrJson,
      },
      500
    );
  }

  const now = new Date().toISOString();
  const targetStage = sdrJson.isFinal
    ? sdrJson.decision === "qualified"
      ? qualifiedStage
      : desqualifiedStage
    : sdrTalkingStage;

  const nextMessage = sdrJson.nextMessage?.toString?.() ?? null;

  const leadPrimaryChannel = lead.primary_channel as "whatsapp" | "email";
  const to =
    leadPrimaryChannel === "whatsapp" ? (lead.contact_phone as string | null) : (lead.contact_email as string | null);
  const outboundText = nextMessage && nextMessage.trim() ? nextMessage.trim() : null;

  // 1) Envia mensagem (se houver) e registra como outbound
  let providerMessageId: string | null = null;
  let providerStatus: string = "queued";
  let providerMetadata: Record<string, unknown> | null = null;

  if (outboundText) {
    if (!to) {
      return jsonResponse(
        { success: false, error: `Lead sem destino para canal ${leadPrimaryChannel}` },
        500
      );
    }

    const subject =
      leadPrimaryChannel === "email" ? `Atualizacao - ${companyName || "lead"}` : undefined;

    const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/send-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        channel: leadPrimaryChannel,
        to,
        message: outboundText,
        ...(subject ? { subject } : {}),
      }),
    });

    const sendJson = await sendRes.json().catch(() => null);
    if (!sendRes.ok || !sendJson?.success) {
      return jsonResponse(
        {
          success: false,
          error: `send-message failed (${sendRes.status}): ${sendJson?.error ?? sendJson ? "unknown" : "no response"}`,
        },
        500
      );
    }

    providerMessageId = getProviderMessageId(sendJson.data);
    providerStatus = typeof sendJson.data?.status === "string" ? sendJson.data.status : providerStatus;
    providerMetadata =
      sendJson.data && typeof sendJson.data === "object"
        ? (sendJson.data as Record<string, unknown>)
        : null;

    // Registro no historico
    const { error: insertError } = await supabase.from("conversation_messages").insert({
      pipeline_lead_id: pipelineLeadId,
      channel: leadPrimaryChannel,
      direction: "outbound",
      provider_message_id: providerMessageId,
      body: outboundText,
      status: providerStatus,
      metadata: providerMetadata,
    });

    if (insertError) {
      return jsonResponse({ success: false, error: insertError.message }, 500);
    }

    // Atualiza preview do lead
    const { error: updateLatestError } = await supabase
      .from("pipeline_leads")
      .update({
        latest_message_preview: outboundText,
        latest_message_at: now,
        latest_direction: "outbound",
      })
      .eq("id", pipelineLeadId);

    if (updateLatestError) {
      return jsonResponse({ success: false, error: updateLatestError.message }, 500);
    }
  }

  // 2) Atualiza etapa (e salva resumo somente quando final)
  const updatePayload: Record<string, unknown> = {
    current_stage_id: targetStage.id,
  };

  if (sdrJson.isFinal) {
    updatePayload.sdr_last_summary = sdrJson.summary;
    updatePayload.sdr_last_reason = sdrJson.reason;
    updatePayload.sdr_last_json = {
      decision: sdrJson.decision,
      confidence: safeNumber(sdrJson.confidence) ?? undefined,
      summary: sdrJson.summary,
      reason: sdrJson.reason,
    };
    updatePayload.sdr_last_run_at = now;
  }

  const { error: updateError } = await supabase
    .from("pipeline_leads")
    .update(updatePayload)
    .eq("id", pipelineLeadId);

  if (updateError) {
    return jsonResponse({ success: false, error: updateError.message }, 500);
  }

  return jsonResponse({
    success: true,
    data: {
      isFinal: sdrJson.isFinal,
      decision: sdrJson.decision,
      nextMessage: sdrJson.nextMessage,
      summary: sdrJson.summary,
      reason: sdrJson.reason,
      confidence: safeNumber(sdrJson.confidence) ?? undefined,
    },
  });
});

