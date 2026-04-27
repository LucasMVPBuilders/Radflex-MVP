import { supabase } from "@/integrations/supabase/client";
import { Lead } from "@/data/types";

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 72; // 72 × 5s = 6 minutos máximo

export async function searchLeadsByCnae(
  cnae: string,
  estado?: string,
  page = 1,
  batch = 0,
  estados?: string[],
  requiredFields?: string[],
  searchTerms?: string[],
): Promise<{ leads: Lead[]; total: number }> {
  // 1. Inicia o run no Apify (retorna imediatamente com runId)
  const { data: startData, error: startError } = await supabase.functions.invoke("search-cnae", {
    body: { cnae, estado, page, batch, estados, requiredFields, searchTerms },
  });

  if (startError) {
    const detail = JSON.stringify(startError, Object.getOwnPropertyNames(startError));
    console.error("Edge function error (start):", detail);
    throw new Error(`[start] ${startError.message || detail}`);
  }

  console.log("start response:", JSON.stringify(startData));

  if (!startData?.success) {
    throw new Error(`[start-fail] ${startData?.error || JSON.stringify(startData)}`);
  }

  // Se por algum motivo a função retornou leads direto (compatibilidade)
  if (startData.status === 'done' || startData.leads) {
    return { leads: startData.leads || [], total: startData.total || 0 };
  }

  const { apifyRunId, datasetId } = startData;

  if (!apifyRunId || !datasetId) {
    throw new Error("Resposta inválida da função: runId ou datasetId ausente");
  }

  // 2. Polling até o run terminar
  for (let i = 0; i < MAX_POLLS; i++) {
    await delay(POLL_INTERVAL_MS);

    const { data: pollData, error: pollError } = await supabase.functions.invoke("search-cnae", {
      body: { mode: "poll", apifyRunId, datasetId, cnae, estado, page, batch, estados, requiredFields },
    });

    if (pollError) {
      const detail = JSON.stringify(pollError, Object.getOwnPropertyNames(pollError));
      console.error("Edge function error (poll):", detail);
      throw new Error(`[poll-${i}] ${pollError.message || detail}`);
    }

    console.log(`poll[${i}]:`, pollData?.status);

    if (!pollData?.success) {
      throw new Error(`[poll-fail-${i}] ${pollData?.error || JSON.stringify(pollData)}`);
    }

    if (pollData.status === "running") {
      continue; // ainda processando, espera mais
    }

    if (pollData.status === "done") {
      return { leads: pollData.leads || [], total: pollData.total || 0 };
    }
  }

  throw new Error("Tempo limite de busca excedido. Tente novamente.");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
