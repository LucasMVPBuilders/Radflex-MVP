import { Lead } from "@/data/types";
import { sendMessage } from "@/lib/api/sendMessage";
import { DispatchChannel } from "@/lib/dispatch/types";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import {
  ConversationMessage,
  PipelineLead,
  PipelineStage,
} from "@/lib/pipeline/types";
import {
  buildPipelineLeadId,
  buildPipelineLeadSnapshot,
  createCustomStageKey,
  createDefaultPipelineStages,
  getPrimaryContactByChannel,
  normalizePipelinePhone,
} from "@/lib/pipeline/utils";

type PipelineStageRow = Tables<"pipeline_stages">;
type PipelineLeadRow = Tables<"pipeline_leads">;
type ConversationMessageRow = Tables<"conversation_messages">;

type RegisterDispatchArgs = {
  lead: Lead;
  leadSource: "saved" | "session";
  channel: DispatchChannel;
  dispatchLogId?: string | null;
  messageBody: string;
  providerData?: Record<string, unknown>;
};

type SendPipelineMessageArgs = {
  pipelineLead: PipelineLead;
  body: string;
};

function mapStage(row: PipelineStageRow): PipelineStage {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    position: row.position,
    color: row.color,
    isActive: row.is_active,
    isSystem: row.is_system,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapConversationMessage(row: ConversationMessageRow): ConversationMessage {
  return {
    id: row.id,
    pipelineLeadId: row.pipeline_lead_id,
    channel: row.channel as DispatchChannel,
    direction: row.direction as "inbound" | "outbound",
    providerMessageId: row.provider_message_id,
    body: row.body,
    status: row.status,
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : null,
    createdAt: row.created_at,
  };
}

function mapPipelineLead(
  row: PipelineLeadRow,
  stage: PipelineStageRow
): PipelineLead {
  const snapshot =
    row.lead_snapshot && typeof row.lead_snapshot === "object"
      ? (row.lead_snapshot as PipelineLead["leadSnapshot"])
      : {
          companyName: "Lead",
          phone: "",
          email: "",
          city: "",
          state: "",
          cnae: "",
        };

  return {
    id: row.id,
    leadId: row.lead_id,
    dispatchLogId: row.dispatch_log_id,
    currentStageId: row.current_stage_id,
    currentStageKey: stage.key,
    currentStageName: stage.name,
    primaryChannel: row.primary_channel as DispatchChannel,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    latestMessagePreview: row.latest_message_preview,
    latestMessageAt: row.latest_message_at,
    latestDirection: row.latest_direction as "inbound" | "outbound" | null,
    unreadCount: row.unread_count,
    leadSnapshot: snapshot,
    // SDR fields (novos columns no schema)
    sdrLastSummary: (row as any).sdr_last_summary ?? null,
    sdrLastReason: (row as any).sdr_last_reason ?? null,
    sdrLastJson:
      (row as any).sdr_last_json && typeof (row as any).sdr_last_json === "object"
        ? ((row as any).sdr_last_json as Record<string, unknown>)
        : null,
    sdrLastRunAt: (row as any).sdr_last_run_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getProviderMessageId(data?: Record<string, unknown>) {
  const sid = data?.sid;
  return typeof sid === "string" ? sid : null;
}

export async function ensurePipelineStagesSeeded() {
  const { count, error } = await (supabase as any)
    .from("pipeline_stages")
    .select("*", { count: "exact", head: true });

  if (error) {
    throw error;
  }

  if ((count ?? 0) > 0) {
    return;
  }

  const { error: insertError } = await (supabase as any)
    .from("pipeline_stages")
    .insert(
      createDefaultPipelineStages().map((stage) => ({
        key: stage.key,
        name: stage.name,
        position: stage.position,
        color: stage.color,
        is_system: stage.isSystem,
        is_active: true,
      }))
    );

  if (insertError) {
    throw insertError;
  }
}

export async function fetchPipelineStages(options?: { includeInactive?: boolean }) {
  await ensurePipelineStagesSeeded();

  let query = (supabase as any)
    .from("pipeline_stages")
    .select("*")
    .order("position", { ascending: true });

  if (!options?.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return ((data ?? []) as PipelineStageRow[]).map(mapStage);
}

export async function fetchPipelineLeads() {
  await ensurePipelineStagesSeeded();

  const [{ data: stages, error: stagesError }, { data: leads, error: leadsError }] =
    await Promise.all([
      (supabase as any)
        .from("pipeline_stages")
        .select("*")
        .eq("is_active", true)
        .order("position", { ascending: true }),
      (supabase as any)
        .from("pipeline_leads")
        .select("*")
        .order("latest_message_at", { ascending: false, nullsFirst: false })
        .order("updated_at", { ascending: false }),
    ]);

  if (stagesError) {
    throw stagesError;
  }

  if (leadsError) {
    throw leadsError;
  }

  const stageById = new Map(
    ((stages ?? []) as PipelineStageRow[]).map((stage) => [stage.id, stage])
  );

  return ((leads ?? []) as PipelineLeadRow[])
    .filter((lead) => stageById.has(lead.current_stage_id))
    .map((lead) => mapPipelineLead(lead, stageById.get(lead.current_stage_id)!));
}

export async function fetchConversationMessages(pipelineLeadId: string) {
  const { data, error } = await (supabase as any)
    .from("conversation_messages")
    .select("*")
    .eq("pipeline_lead_id", pipelineLeadId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as ConversationMessageRow[]).map(mapConversationMessage);
}

export async function registerDispatchToPipeline({
  lead,
  leadSource,
  channel,
  dispatchLogId,
  messageBody,
  providerData,
}: RegisterDispatchArgs) {
  await ensurePipelineStagesSeeded();

  const leadId = buildPipelineLeadId(lead, leadSource);
  const [{ data: defaultStage, error: stageError }, { data: existingLead, error: leadError }] =
    await Promise.all([
      (supabase as any)
        .from("pipeline_stages")
        .select("*")
        .eq("key", "dispatch_started")
        .single(),
      (supabase as any)
        .from("pipeline_leads")
        .select("*")
        .eq("lead_id", leadId)
        .maybeSingle(),
    ]);

  if (stageError) {
    throw stageError;
  }

  if (leadError) {
    throw leadError;
  }

  const now = new Date().toISOString();
  const basePayload = {
    dispatch_log_id: dispatchLogId ?? null,
    primary_channel: channel,
    contact_phone: normalizePipelinePhone(lead.phone),
    contact_email: lead.email?.trim() || null,
    latest_message_preview: messageBody,
    latest_message_at: now,
    latest_direction: "outbound",
    lead_snapshot: buildPipelineLeadSnapshot(lead),
  };

  let pipelineLeadId: string;

  if (existingLead) {
    const { data: updatedLead, error: updateError } = await (supabase as any)
      .from("pipeline_leads")
      .update(basePayload)
      .eq("id", existingLead.id)
      .select("*")
      .single();

    if (updateError) {
      throw updateError;
    }

    pipelineLeadId = updatedLead.id;
  } else {
    const { data: insertedLead, error: insertError } = await (supabase as any)
      .from("pipeline_leads")
      .insert({
        lead_id: leadId,
        current_stage_id: defaultStage.id,
        unread_count: 0,
        ...basePayload,
      })
      .select("*")
      .single();

    if (insertError) {
      throw insertError;
    }

    pipelineLeadId = insertedLead.id;
  }

  const { error: messageError } = await (supabase as any)
    .from("conversation_messages")
    .insert({
      pipeline_lead_id: pipelineLeadId,
      channel,
      direction: "outbound",
      provider_message_id: getProviderMessageId(providerData),
      body: messageBody,
      status:
        typeof providerData?.status === "string" ? providerData.status : "queued",
      metadata: providerData ?? null,
    });

  if (messageError) {
    throw messageError;
  }
}

export async function sendPipelineMessage({
  pipelineLead,
  body,
}: SendPipelineMessageArgs) {
  const channel = pipelineLead.primaryChannel;
  const to =
    channel === "whatsapp" ? pipelineLead.contactPhone : pipelineLead.contactEmail;

  if (!to) {
    return { success: false, error: "Lead sem contato válido para este canal." };
  }

  const result = await sendMessage({ channel, to, message: body });

  if (!result.success) {
    return result;
  }

  const now = new Date().toISOString();
  const { error: messageError } = await (supabase as any)
    .from("conversation_messages")
    .insert({
      pipeline_lead_id: pipelineLead.id,
      channel,
      direction: "outbound",
      provider_message_id: getProviderMessageId(result.data),
      body,
      status:
        typeof result.data?.status === "string" ? result.data.status : "queued",
      metadata: result.data ?? null,
    });

  if (messageError) {
    return { success: false, error: messageError.message };
  }

  const { error: updateError } = await (supabase as any)
    .from("pipeline_leads")
    .update({
      latest_message_preview: body,
      latest_message_at: now,
      latest_direction: "outbound",
    })
    .eq("id", pipelineLead.id);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  return result;
}

export async function movePipelineLeadStage(
  pipelineLeadId: string,
  stageId: string
) {
  const { error } = await (supabase as any)
    .from("pipeline_leads")
    .update({ current_stage_id: stageId })
    .eq("id", pipelineLeadId);

  if (error) {
    throw error;
  }
}

export async function markPipelineLeadAsRead(pipelineLeadId: string) {
  const { error } = await (supabase as any)
    .from("pipeline_leads")
    .update({ unread_count: 0 })
    .eq("id", pipelineLeadId);

  if (error) {
    throw error;
  }
}

export async function updatePipelineStage(
  stageId: string,
  updates: Partial<{
    name: string;
    color: string | null;
    isActive: boolean;
    position: number;
  }>
) {
  const payload = {
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.color !== undefined ? { color: updates.color } : {}),
    ...(updates.isActive !== undefined ? { is_active: updates.isActive } : {}),
    ...(updates.position !== undefined ? { position: updates.position } : {}),
  };

  const { error } = await (supabase as any)
    .from("pipeline_stages")
    .update(payload)
    .eq("id", stageId);

  if (error) {
    throw error;
  }
}

export async function deletePipelineStage(stageId: string) {
  // Block deletion of system stages (defensive — DB has a FK constraint that
  // would already prevent dropping a stage with leads, but checking is_system
  // here gives a friendlier error message).
  const { data: stage, error: fetchError } = await (supabase as any)
    .from("pipeline_stages")
    .select("is_system, name")
    .eq("id", stageId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!stage) throw new Error("Etapa não encontrada.");
  if (stage.is_system) {
    throw new Error(
      `A etapa "${stage.name}" é do sistema e não pode ser removida. Desative-a se não precisar.`,
    );
  }

  // Refuse to delete if leads are in this stage — they'd lose their stage_id
  // (NOT NULL FK in pipeline_leads). User must move them first.
  const { count, error: countError } = await (supabase as any)
    .from("pipeline_leads")
    .select("*", { count: "exact", head: true })
    .eq("current_stage_id", stageId);

  if (countError) throw countError;
  if ((count ?? 0) > 0) {
    throw new Error(
      `Existem ${count} lead${count === 1 ? "" : "s"} nesta etapa. Mova-os antes de remover.`,
    );
  }

  const { error } = await (supabase as any)
    .from("pipeline_stages")
    .delete()
    .eq("id", stageId);

  if (error) throw error;
}

export async function createPipelineStage(name: string) {
  const { data: lastStage, error: lastStageError } = await (supabase as any)
    .from("pipeline_stages")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastStageError) {
    throw lastStageError;
  }

  const nextPosition = Number(lastStage?.position ?? -1) + 1;
  const { error } = await (supabase as any).from("pipeline_stages").insert({
    key: createCustomStageKey(name),
    name,
    position: nextPosition,
    color: "#94A3B8",
    is_system: false,
    is_active: true,
  });

  if (error) {
    throw error;
  }
}

export async function receiveInboundPipelineMessage(args: {
  from: string;
  body: string;
  providerMessageId?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const normalizedPhone = normalizePipelinePhone(args.from);

  if (!normalizedPhone) {
    throw new Error("Numero de origem invalido no webhook.");
  }

  const [{ data: pipelineLead, error: leadError }, { data: repliedStage, error: stageError }] =
    await Promise.all([
      (supabase as any)
        .from("pipeline_leads")
        .select("*")
        .eq("contact_phone", normalizedPhone)
        .maybeSingle(),
      (supabase as any)
        .from("pipeline_stages")
        .select("*")
        .eq("key", "replied")
        .maybeSingle(),
    ]);

  if (leadError) {
    throw leadError;
  }

  if (stageError) {
    throw stageError;
  }

  if (!pipelineLead) {
    throw new Error("Nenhum pipeline_lead encontrado para o numero recebido.");
  }

  const now = new Date().toISOString();

  const { error: messageError } = await (supabase as any)
    .from("conversation_messages")
    .insert({
      pipeline_lead_id: pipelineLead.id,
      channel: "whatsapp",
      direction: "inbound",
      provider_message_id: args.providerMessageId ?? null,
      body: args.body,
      status: args.status ?? "received",
      metadata: args.metadata ?? null,
    });

  if (messageError) {
    throw messageError;
  }

  const updatePayload: Record<string, unknown> = {
    latest_message_preview: args.body,
    latest_message_at: now,
    latest_direction: "inbound",
    unread_count: Number(pipelineLead.unread_count ?? 0) + 1,
  };

  if (repliedStage && pipelineLead.current_stage_id !== repliedStage.id) {
    updatePayload.current_stage_id = repliedStage.id;
  }

  const { error: updateError } = await (supabase as any)
    .from("pipeline_leads")
    .update(updatePayload)
    .eq("id", pipelineLead.id);

  if (updateError) {
    throw updateError;
  }
}
