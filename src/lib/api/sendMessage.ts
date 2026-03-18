import { supabase } from "@/integrations/supabase/client";
import { DispatchChannel } from "@/lib/dispatch/types";

interface SendMessageArgs {
  channel: DispatchChannel;
  to: string;
  message: string;
  subject?: string;
}

interface SendMessageResult {
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

async function getSupabaseFunctionErrorMessage(error: unknown) {
  const fallbackMessage =
    error instanceof Error
      ? error.message
      : "Erro de rede ao chamar Edge Function";

  const context = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;
  if (!context?.json) {
    return fallbackMessage;
  }

  try {
    const payload = await context.json();
    if (
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
    ) {
      return payload.error;
    }
  } catch {
    // Ignore context parsing failures and fall back to the original message.
  }

  return fallbackMessage;
}

export async function sendMessage(
  args: SendMessageArgs
): Promise<SendMessageResult> {
  const { data, error } = await supabase.functions.invoke("send-message", {
    body: args,
  });

  if (error) {
    return { success: false, error: await getSupabaseFunctionErrorMessage(error) };
  }

  if (!data?.success) {
    return { success: false, error: data?.error ?? "Erro desconhecido" };
  }

  return {
    success: true,
    data:
      data.data && typeof data.data === "object"
        ? (data.data as Record<string, unknown>)
        : undefined,
  };
}
