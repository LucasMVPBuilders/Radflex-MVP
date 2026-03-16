import { supabase } from "@/integrations/supabase/client";
import { Lead } from "@/data/types";

export async function searchLeadsByCnae(cnae: string, estado?: string, page = 1): Promise<{ leads: Lead[]; total: number }> {
  const { data, error } = await supabase.functions.invoke("search-cnae", {
    body: { cnae, estado, page },
  });

  if (error) {
    console.error("Edge function error:", error);
    throw new Error(error.message || "Erro ao buscar leads");
  }

  if (!data?.success) {
    throw new Error(data?.error || "Erro ao buscar leads");
  }

  return { leads: data.leads || [], total: data.total || 0 };
}
