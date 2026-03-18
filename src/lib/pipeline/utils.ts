import { Lead } from "@/data/types";
import { DispatchChannel } from "@/lib/dispatch/types";
import { PipelineLeadSnapshot, PipelineStageSeed } from "./types";

export function createDefaultPipelineStages(): PipelineStageSeed[] {
  return [
    {
      key: "dispatch_started",
      name: "Disparo iniciado",
      position: 0,
      color: "#5B2ECC",
      isSystem: true,
    },
    {
      key: "replied",
      name: "Respondeu",
      position: 1,
      color: "#0EA5E9",
      isSystem: true,
    },
    {
      key: "qualified",
      name: "Qualificado",
      position: 2,
      color: "#10B981",
      isSystem: true,
    },
    {
      key: "proposal",
      name: "Proposta",
      position: 3,
      color: "#F59E0B",
      isSystem: true,
    },
    {
      key: "closed",
      name: "Fechado",
      position: 4,
      color: "#EF4444",
      isSystem: true,
    },
  ];
}

export function normalizePipelinePhone(value: string | null | undefined): string | null {
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

export function buildPipelineLeadId(lead: Lead, source: "saved" | "session") {
  return `${source}:${lead.id}`;
}

export function buildPipelineLeadSnapshot(lead: Lead): PipelineLeadSnapshot {
  return {
    companyName: lead.companyName,
    phone: lead.phone,
    email: lead.email,
    city: lead.city,
    state: lead.state,
    cnae: lead.cnae,
    ...(lead.website ? { website: lead.website } : {}),
    ...(lead.address ? { address: lead.address } : {}),
  };
}

export function getPrimaryContactByChannel(
  lead: Lead,
  channel: DispatchChannel
) {
  return channel === "whatsapp" ? normalizePipelinePhone(lead.phone) : lead.email?.trim() || null;
}

export function createCustomStageKey(name: string) {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `custom_${slug || "stage"}_${Date.now()}`;
}
