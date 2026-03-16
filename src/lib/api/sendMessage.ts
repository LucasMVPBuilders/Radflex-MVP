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
}

export async function sendMessage(
  args: SendMessageArgs
): Promise<SendMessageResult> {
  const { data, error } = await supabase.functions.invoke("send-message", {
    body: args,
  });

  if (error) {
    // FunctionsHttpError / FunctionsRelayError / FunctionsFetchError all have .message
    return { success: false, error: error.message ?? "Erro de rede ao chamar Edge Function" };
  }

  if (!data?.success) {
    return { success: false, error: data?.error ?? "Erro desconhecido" };
  }

  return { success: true };
}
