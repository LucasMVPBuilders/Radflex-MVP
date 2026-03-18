import { supabase } from "@/integrations/supabase/client";

export type SdrPromptRow = {
  id: string;
  name: string;
  prompt: string;
  isActive: boolean;
  updatedAt: string;
};

export async function fetchLatestSdrPrompt(): Promise<SdrPromptRow | null> {
  const { data, error } = await (supabase as any)
    .from("sdr_prompts")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id as string,
    name: (data.name as string) ?? "Default",
    prompt: data.prompt as string,
    isActive: Boolean(data.is_active),
    updatedAt: data.updated_at as string,
  };
}

export async function saveSdrPrompt(args: {
  prompt: string;
  isActive: boolean;
}): Promise<void> {
  const prompt = args.prompt.trim();
  if (!prompt) {
    throw new Error("O prompt do SDR nao pode ficar vazio.");
  }

  const latest = await fetchLatestSdrPrompt();

  // Se ativar, marca todos os outros como inativos (singleton ativo).
  if (args.isActive) {
    await (supabase as any).from("sdr_prompts").update({ is_active: false });
  }

  if (latest) {
    const { error } = await (supabase as any)
      .from("sdr_prompts")
      .update({ prompt, is_active: args.isActive })
      .eq("id", latest.id);
    if (error) throw error;
  } else {
    const { error } = await (supabase as any).from("sdr_prompts").insert({
      name: "Default",
      prompt,
      is_active: args.isActive,
    });
    if (error) throw error;
  }
}

