import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Activity, AlertTriangle, RefreshCw } from 'lucide-react';
import { ApifyUsageData, ApifyRunRecord } from '@/hooks/useApifyUsage';

interface UsagePopoverProps {
  data: ApifyUsageData | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function usageColor(percent: number): string {
  if (percent >= 85) return 'text-red-500';
  if (percent >= 60) return 'text-yellow-500';
  return 'text-emerald-500';
}

function progressColor(percent: number): string {
  if (percent >= 85) return 'bg-red-500';
  if (percent >= 60) return 'bg-yellow-500';
  return 'bg-emerald-500';
}

export function UsagePopover({ data, loading, error, onRefresh }: UsagePopoverProps) {
  const percent = data?.account.usagePercent ?? 0;
  const isAlert = percent >= 85;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-border text-xs font-medium transition-colors hover:bg-muted"
          title="Uso Apify"
        >
          {isAlert ? (
            <AlertTriangle className={`h-3.5 w-3.5 ${usageColor(percent)}`} />
          ) : (
            <Activity className={`h-3.5 w-3.5 ${usageColor(percent)}`} />
          )}
          <span className={usageColor(percent)}>
            {loading && !data ? '...' : `${percent.toFixed(0)}%`}
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-4 space-y-4" align="end">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Uso Apify</p>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
            title="Atualizar"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {error && (
          <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 px-2 py-1 rounded">
            {error}
          </p>
        )}

        {!data && !loading && !error && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Carregando dados de uso...
          </p>
        )}

        {data && (
          <>
            {/* Barra de progresso */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Créditos usados</span>
                <span>
                  {formatCents(data.account.usedCents)} / {formatCents(data.account.planLimitCents)}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${progressColor(percent)}`}
                  style={{ width: `${Math.min(percent, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {formatCents(data.account.remainingCents)} restantes · plano{' '}
                <span className="font-medium">{data.account.planName}</span>
              </p>
            </div>

            {/* Alerta */}
            {isAlert && (
              <div className="flex items-start gap-2 p-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
                <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-600 dark:text-red-400">
                  Você usou <strong>{percent.toFixed(0)}%</strong> do limite mensal. Considere
                  fazer upgrade do plano.
                </p>
              </div>
            )}

            {/* Estimativa */}
            <div className="text-xs space-y-1 border-t border-border pt-3">
              <p className="font-medium text-foreground">Estimativa de uso</p>
              <p className="text-muted-foreground">
                <span className="font-mono font-medium text-foreground">
                  {data.history.totalCuThisMonth.toFixed(2)}
                </span>{' '}
                CUs consumidos este mês
              </p>
              {data.history.avgCuPerRun > 0 && (
                <p className="text-muted-foreground">
                  Média de{' '}
                  <span className="font-mono font-medium text-foreground">
                    {data.history.avgCuPerRun.toFixed(2)}
                  </span>{' '}
                  CU por busca
                </p>
              )}
              {data.history.estimatedSearchesRemaining !== null && (
                <p className="text-muted-foreground">
                  ~{' '}
                  <span className={`font-mono font-medium ${usageColor(percent)}`}>
                    {data.history.estimatedSearchesRemaining}
                  </span>{' '}
                  buscas restantes estimadas
                </p>
              )}
            </div>

            {/* Histórico de buscas */}
            {data.history.recentRuns.length > 0 ? (
              <div className="space-y-1.5 border-t border-border pt-3">
                <p className="text-xs font-medium">Últimas buscas</p>
                <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                  {data.history.recentRuns.map((run: ApifyRunRecord, i: number) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-xs py-1 border-b border-border/40 last:border-0"
                    >
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-foreground truncate">
                          CNAE {run.cnae} · {run.estado}
                        </span>
                        <span className="text-muted-foreground text-[10px]">
                          {formatDate(run.createdAt)}
                        </span>
                      </div>
                      <span className="font-mono font-medium text-foreground shrink-0 ml-2">
                        {run.computeUnits.toFixed(2)} CU
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-2 border-t border-border pt-3">
                Nenhuma busca registrada este mês ainda.
              </p>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
