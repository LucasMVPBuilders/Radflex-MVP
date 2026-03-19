import { useState, useEffect, useCallback } from 'react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

export interface ApifyRunRecord {
  cnae: string;
  estado: string;
  computeUnits: number;
  createdAt: string;
}

export interface ApifyUsageData {
  account: {
    planLimitCents: number;
    usedCents: number;
    remainingCents: number;
    usagePercent: number;
    planName: string;
  };
  history: {
    totalCuThisMonth: number;
    avgCuPerRun: number;
    estimatedSearchesRemaining: number | null;
    recentRuns: ApifyRunRecord[];
  };
}

export function useApifyUsage() {
  const [data, setData] = useState<ApifyUsageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsage = useCallback(async () => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/apify-usage`, {
        headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      const json = await res.json();
      if (json.success) {
        setData(json);
      } else {
        setError(json.error ?? 'Erro ao buscar uso Apify');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Busca imediata ao montar
  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  // Polling a cada 5 minutos
  useEffect(() => {
    const interval = setInterval(fetchUsage, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchUsage]);

  return { data, loading, error, refresh: fetchUsage };
}
