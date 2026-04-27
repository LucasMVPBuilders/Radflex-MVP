import { supabase } from "@/integrations/supabase/client";

export interface AppSettings {
  twilioWhatsappFrom: string | null;
  twilioSmsFrom: string | null;
  sendgridFromEmail: string | null;
  updatedAt: string | null;
}

const SINGLETON_ID = true as const;

export async function fetchAppSettings(): Promise<AppSettings> {
  const { data, error } = await (supabase as any)
    .from("app_settings")
    .select("*")
    .eq("id", SINGLETON_ID)
    .maybeSingle();

  if (error) {
    console.error("fetchAppSettings error:", error);
    throw error;
  }

  return {
    twilioWhatsappFrom: data?.twilio_whatsapp_from ?? null,
    twilioSmsFrom: data?.twilio_sms_from ?? null,
    sendgridFromEmail: data?.sendgrid_from_email ?? null,
    updatedAt: data?.updated_at ?? null,
  };
}

export async function saveAppSettings(input: {
  twilioWhatsappFrom?: string | null;
  twilioSmsFrom?: string | null;
  sendgridFromEmail?: string | null;
}): Promise<void> {
  const payload: Record<string, unknown> = { id: SINGLETON_ID };

  if (input.twilioWhatsappFrom !== undefined) {
    payload.twilio_whatsapp_from = normalizeOrNull(input.twilioWhatsappFrom);
  }
  if (input.twilioSmsFrom !== undefined) {
    payload.twilio_sms_from = normalizeOrNull(input.twilioSmsFrom);
  }
  if (input.sendgridFromEmail !== undefined) {
    payload.sendgrid_from_email = normalizeOrNull(input.sendgridFromEmail);
  }

  const { error } = await (supabase as any)
    .from("app_settings")
    .upsert(payload, { onConflict: "id" });

  if (error) {
    console.error("saveAppSettings error:", error);
    throw error;
  }
}

function normalizeOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export interface IntegrationTestResult {
  ok: boolean;
  detail?: string;
  error?: string;
}

export async function testIntegration(
  provider: "twilio" | "sendgrid",
): Promise<IntegrationTestResult> {
  // Slug deployado no Supabase: "Teste-integration" (T maiúsculo + pt-BR).
  // Se um dia for renomeado pra "test-integration", basta trocar aqui.
  const { data, error } = await supabase.functions.invoke("Teste-integration", {
    body: { provider },
  });

  if (error) {
    return {
      ok: false,
      error: error.message ?? "Erro ao chamar test-integration",
    };
  }

  if (!data || typeof data !== "object") {
    return { ok: false, error: "Resposta inválida da função." };
  }

  return data as IntegrationTestResult;
}
