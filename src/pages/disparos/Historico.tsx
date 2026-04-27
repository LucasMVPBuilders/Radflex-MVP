import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchDispatchHistory,
  fetchDispatchStats,
  DispatchHistoryFilters,
  DispatchStats,
} from "@/lib/api/dispatchHistory";
import { DispatchLogRow } from "@/lib/dispatch/types";
import { Lead } from "@/data/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CheckCircle2,
  Clock,
  Eye,
  MessageCircle,
  XCircle,
  Loader2,
  Filter,
  RefreshCcw,
  Ban,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type RangePreset = "7d" | "30d" | "90d" | "all";

const RANGE_PRESETS: Record<RangePreset, { label: string; days: number | null }> = {
  "7d": { label: "Últimos 7 dias", days: 7 },
  "30d": { label: "Últimos 30 dias", days: 30 },
  "90d": { label: "Últimos 90 dias", days: 90 },
  all: { label: "Todo período", days: null },
};

const STATUS_META: Record<
  DispatchLogRow["status"],
  { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }
> = {
  pending: { label: "Aguardando", cls: "bg-muted text-muted-foreground", icon: Clock },
  queued: { label: "Na fila", cls: "bg-muted text-muted-foreground", icon: Clock },
  sent: { label: "Enviado", cls: "bg-primary/15 text-primary", icon: CheckCircle2 },
  delivered: {
    label: "Entregue",
    cls: "bg-blue-500/15 text-blue-600",
    icon: CheckCircle2,
  },
  read: {
    label: "Lido",
    cls: "bg-purple-500/15 text-purple-600",
    icon: Eye,
  },
  replied: {
    label: "Respondeu",
    cls: "bg-green-500/15 text-green-600",
    icon: MessageCircle,
  },
  failed: {
    label: "Falhou",
    cls: "bg-destructive/15 text-destructive",
    icon: XCircle,
  },
  undelivered: {
    label: "Não entregue",
    cls: "bg-destructive/15 text-destructive",
    icon: XCircle,
  },
  cancelled: {
    label: "Cancelado",
    cls: "bg-muted text-muted-foreground",
    icon: Ban,
  },
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Classifies dispatch errors into "retry makes sense" vs "retry will keep failing".
 *
 * Twilio error codes reference: https://www.twilio.com/docs/api/errors
 * The error_msg field stores codes like "63016" for WhatsApp window-closed,
 * "30005" for unknown destination, "21408" for unprovisioned number, etc.
 */
function classifyError(errorMsg: string | null): {
  isPermanent: boolean;
  hint?: string;
} {
  if (!errorMsg) return { isPermanent: false };

  const code = errorMsg.match(/\b(\d{5})\b/)?.[1];

  // Permanent errors — retry will fail with the same code
  const permanent: Record<string, string> = {
    "63016":
      "Janela WhatsApp de 24h fechada. Reenvio freeform vai falhar de novo — espere o lead responder ou use template HSM aprovado.",
    "63015": "Template não aprovado. Crie e aprove o template no Twilio antes de reenviar.",
    "63007": "Número de destino não tem WhatsApp. Reenvio não vai resolver.",
    "63112":
      "Meta DESATIVOU sua conta WhatsApp Business. Reenvio é impossível até reativação. Acesse business.facebook.com → Security Center pra ver o motivo (geralmente spam ou violação de política) e abrir apelação.",
    "63017": "Sender não está associado à conta WhatsApp. Reconfigure no Twilio Console.",
    "63021": "Canal desabilitado pelo sender. Verifique o status do sender no Twilio.",
    "63036": "Template HSM não aprovado pelo WhatsApp. Submeta o template e aguarde aprovação.",
    "63071":
      "Lead no Brasil exige template opt-in. Use HSM aprovado pra primeira interação.",
    "21408": "Número não autorizado para WhatsApp/SMS. Verifique a configuração do sender no Twilio.",
    "21610": "Lead optou-se por não receber mensagens (STOP). Reenvio não funciona.",
    "21614": "Número de destino inválido. Reenvio com mesmo número vai falhar.",
  };

  if (code && permanent[code]) {
    return { isPermanent: true, hint: permanent[code] };
  }

  return { isPermanent: false };
}

/**
 * Reconstructs a Lead object from the dispatch_logs row's lead_snapshot.
 * Used when "Reenviar" needs to seed Novo.tsx with the original lead.
 */
function leadFromSnapshot(row: DispatchLogRow): Lead | null {
  const s = row.lead_snapshot;
  if (!s) return null;

  // Strip the "saved:" / "session:" prefix from lead_id to get the real id
  const realId = row.lead_id.replace(/^(saved|session):/, "");

  return {
    id: realId,
    companyName: s.companyName,
    cnae: s.cnae ?? "",
    estimatedRevenue: 0,
    city: s.city ?? "",
    state: s.state ?? "",
    phone: s.phone ?? "",
    email: s.email ?? "",
    status: "found",
    cnpj: "",
  };
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "primary" | "success" | "destructive";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4 space-y-1",
        tone === "primary" && "border-primary/30 bg-primary/5",
        tone === "success" && "border-green-500/30 bg-green-500/5",
        tone === "destructive" && "border-destructive/30 bg-destructive/5",
      )}
    >
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-2xl font-bold font-mono-data">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export default function Historico() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<DispatchLogRow[]>([]);
  const [stats, setStats] = useState<DispatchStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] =
    useState<DispatchHistoryFilters["channel"]>("all");
  const [statusFilter, setStatusFilter] =
    useState<DispatchHistoryFilters["status"]>("all");
  const [templateFilter, setTemplateFilter] = useState<string>("all");
  const [range, setRange] = useState<RangePreset>("30d");
  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([]);

  // Load templates for the filter dropdown
  useEffect(() => {
    (supabase as any)
      .from("message_templates")
      .select("id, name")
      .order("name")
      .then(({ data }: { data: Array<{ id: string; name: string }> | null }) => {
        setTemplates(data ?? []);
      });
  }, []);

  const filters: DispatchHistoryFilters = useMemo(() => {
    const days = RANGE_PRESETS[range].days;
    const fromDate = days
      ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      : undefined;
    return {
      channel: channelFilter,
      status: statusFilter,
      templateId: templateFilter,
      search,
      fromDate,
    };
  }, [channelFilter, statusFilter, templateFilter, search, range]);

  const reload = async () => {
    setLoading(true);
    try {
      const [logs, st] = await Promise.all([
        fetchDispatchHistory(filters),
        fetchDispatchStats({
          channel: channelFilter,
          fromDate: filters.fromDate,
        }),
      ]);
      setRows(logs);
      setStats(st);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelFilter, statusFilter, templateFilter, range]);

  // Search is local-only — debounced via useMemo recalc, no DB roundtrip
  const visibleRows = useMemo(() => {
    if (!search.trim()) return rows;
    const needle = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.lead_snapshot?.companyName?.toLowerCase().includes(needle) ||
        r.contact_value?.toLowerCase().includes(needle),
    );
  }, [rows, search]);

  const clearFilters = () => {
    setSearch("");
    setChannelFilter("all");
    setStatusFilter("all");
    setTemplateFilter("all");
    setRange("30d");
  };

  const handleResend = (row: DispatchLogRow) => {
    const lead = leadFromSnapshot(row);
    if (!lead) {
      toast.error("Não foi possível reconstruir o lead deste disparo.");
      return;
    }

    const { isPermanent, hint } = classifyError(row.error_msg);

    navigate("/disparos/novo", {
      state: {
        preselectedLead: lead,
        channel: row.channel,
        preselectedTemplateId: row.template_id ?? undefined,
        resendNotice: isPermanent
          ? hint
          : `Reenvio para ${lead.companyName} preparado. Confirme o template e dispare.`,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          label="Total"
          value={stats?.total ?? "—"}
          hint={RANGE_PRESETS[range].label}
        />
        <StatCard
          label="Enviados"
          value={stats?.sent ?? "—"}
          tone="primary"
        />
        <StatCard
          label="Entregues"
          value={stats ? `${stats.delivered}` : "—"}
          hint={stats ? `${stats.deliveryRate}% taxa` : undefined}
          tone="success"
        />
        <StatCard
          label="Lidos"
          value={stats ? `${stats.read}` : "—"}
          hint={stats ? `${stats.readRate}% taxa` : undefined}
        />
        <StatCard
          label="Responderam"
          value={stats ? `${stats.replied}` : "—"}
          hint={stats ? `${stats.replyRate}% taxa` : undefined}
          tone="success"
        />
      </div>

      {/* Filters */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Filter className="h-4 w-4" />
          Filtros
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <Input
            placeholder="Buscar empresa ou contato..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9"
          />
          <Select value={range} onValueChange={(v) => setRange(v as RangePreset)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(RANGE_PRESETS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={channelFilter ?? "all"}
            onValueChange={(v) =>
              setChannelFilter(v as DispatchHistoryFilters["channel"])
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Canal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os canais</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="email">Email</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={statusFilter ?? "all"}
            onValueChange={(v) =>
              setStatusFilter(v as DispatchHistoryFilters["status"])
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="sent">Enviado</SelectItem>
              <SelectItem value="delivered">Entregue</SelectItem>
              <SelectItem value="read">Lido</SelectItem>
              <SelectItem value="replied">Respondeu</SelectItem>
              <SelectItem value="failed">Falhou</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
            </SelectContent>
          </Select>
          <Select value={templateFilter} onValueChange={setTemplateFilter}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Template" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os templates</SelectItem>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex justify-between items-center pt-1">
          <p className="text-xs text-muted-foreground">
            {visibleRows.length} resultado
            {visibleRows.length !== 1 ? "s" : ""}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={clearFilters}>
              Limpar
            </Button>
            <Button size="sm" variant="outline" onClick={reload} disabled={loading}>
              <RefreshCcw
                className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")}
              />
              Atualizar
            </Button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <ScrollArea className="h-[60vh]">
          <TooltipProvider delayDuration={150}>
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Enviado</TableHead>
                  <TableHead>Entregue</TableHead>
                  <TableHead>Lido</TableHead>
                  <TableHead>Respondeu</TableHead>
                  <TableHead className="w-20 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-center py-12 text-muted-foreground"
                    >
                      <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                      Carregando histórico...
                    </TableCell>
                  </TableRow>
                )}
                {!loading && visibleRows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-center py-12 text-muted-foreground"
                    >
                      Nenhum disparo encontrado para os filtros atuais.
                    </TableCell>
                  </TableRow>
                )}
                {visibleRows.map((row) => {
                  const meta = STATUS_META[row.status];
                  const Icon = meta.icon;
                  const isFailed =
                    row.status === "failed" || row.status === "undelivered";
                  const errorInfo = isFailed ? classifyError(row.error_msg) : null;
                  const canResend = isFailed && !!row.lead_snapshot;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span className="truncate max-w-[260px]">
                            {row.lead_snapshot?.companyName ?? "—"}
                          </span>
                          <span className="text-xs text-muted-foreground font-mono-data">
                            {row.contact_value ?? "—"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs uppercase tracking-wide">
                        {row.channel}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            "gap-1 font-medium border-0",
                            meta.cls,
                          )}
                        >
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </Badge>
                        {row.error_msg && (
                          <p
                            className="text-xs text-destructive mt-1 truncate max-w-[220px]"
                            title={row.error_msg}
                          >
                            {row.error_msg}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {row.template_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatDate(row.sent_at)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatDate(row.delivered_at)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatDate(row.read_at)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatDate(row.replied_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        {canResend ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant={errorInfo?.isPermanent ? "outline" : "default"}
                                className="h-7 px-2 gap-1"
                                onClick={() => handleResend(row)}
                              >
                                {errorInfo?.isPermanent ? (
                                  <AlertTriangle className="h-3 w-3" />
                                ) : (
                                  <RotateCcw className="h-3 w-3" />
                                )}
                                <span className="text-xs">Reenviar</span>
                              </Button>
                            </TooltipTrigger>
                            {errorInfo?.hint && (
                              <TooltipContent className="max-w-xs">
                                <p className="text-xs">{errorInfo.hint}</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TooltipProvider>
        </ScrollArea>
      </div>
    </div>
  );
}
