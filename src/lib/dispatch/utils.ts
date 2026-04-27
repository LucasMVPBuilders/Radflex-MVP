import { Lead } from "@/data/types";
import { DispatchChannel } from "./types";

export function normalizeContact(
  contact: string,
  channel: DispatchChannel
): string | null {
  if (!contact) return null;

  if (channel === "email") {
    return contact.includes("@") ? contact.trim() : null;
  }

  // WhatsApp — normalize to E.164 Brazilian format
  const digits = contact.replace(/\D/g, "");

  // 10 digits = landline (DDD + 8), 11 digits = mobile (DDD + 9 + 8)
  // → prepend Brazil country code +55
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }
  // 12 digits = 55 + landline, 13 digits = 55 + mobile
  // → already has country code, just prepend +
  if (digits.length === 12 || digits.length === 13) {
    return `+${digits}`;
  }

  // Any other length (e.g. email stripped of @/. = random digits) → invalid
  return null;
}

export function interpolate(template: string, lead: Lead): string {
  return template
    .replace(/{{nomeEmpresa}}/g, lead.companyName)
    .replace(/{{cidade}}/g, lead.city)
    .replace(/{{estado}}/g, lead.state)
    .replace(/{{telefone}}/g, lead.phone ?? "")
    .replace(/{{email}}/g, lead.email ?? "")
    .replace(/{{cnae}}/g, lead.cnae);
}

/**
 * Lookup table for variable keys → lead field values, used when filling HSM
 * Content Variables. Keep in sync with the placeholder list in TemplateEditor
 * and Templates pages.
 */
const LEAD_VARIABLE_VALUES: Record<string, (lead: Lead) => string> = {
  nomeEmpresa: (l) => l.companyName ?? "",
  cidade: (l) => l.city ?? "",
  estado: (l) => l.state ?? "",
  telefone: (l) => l.phone ?? "",
  email: (l) => l.email ?? "",
  cnae: (l) => l.cnae ?? "",
};

export const AVAILABLE_VARIABLE_KEYS = Object.keys(LEAD_VARIABLE_VALUES);

/**
 * Builds the ContentVariables payload for Twilio HSM dispatches.
 * Twilio expects an object keyed by 1-based index:
 *   { "1": "Acme Inc.", "2": "São Paulo" }
 *
 * variable_keys on the template stores which lead field each {{N}} maps to,
 * e.g. ["nomeEmpresa", "cidade"] → 1=companyName, 2=city.
 */
export function buildContentVariables(
  variableKeys: string[] | null | undefined,
  lead: Lead,
): Record<string, string> {
  if (!variableKeys || variableKeys.length === 0) return {};

  const result: Record<string, string> = {};
  variableKeys.forEach((key, index) => {
    const resolver = LEAD_VARIABLE_VALUES[key];
    result[String(index + 1)] = resolver ? resolver(lead) : "";
  });
  return result;
}
