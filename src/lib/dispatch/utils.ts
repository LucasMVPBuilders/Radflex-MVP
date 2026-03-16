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
