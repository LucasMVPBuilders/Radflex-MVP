import { useState, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Lead } from "@/data/types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ChevronDown,
  Filter,
  Phone,
  Mail,
  Globe,
  Star,
  X,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchAllDispatchedContacts,
} from "@/lib/api/dispatchHistory";
import { normalizeContact } from "@/lib/dispatch/utils";
import { DispatchChannel } from "@/lib/dispatch/types";

interface LeadSelectorProps {
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>, leads: Lead[]) => void;
  sessionLeads: Lead[];
  channel: DispatchChannel;
}

type DispatchFilter = "any" | "never" | "previously";

const CNAE_OPTIONS = [
  { code: "8640205", label: "Radiologia (8640-2/05)" },
  { code: "8640207", label: "Ultrassonografia (8640-2/07)" },
  { code: "8640204", label: "Tomografia (8640-2/04)" },
];

const REVENUE_BUCKETS = [
  { label: "Qualquer", min: 0, max: Number.MAX_SAFE_INTEGER },
  { label: "≥ R$ 500k", min: 500_000, max: Number.MAX_SAFE_INTEGER },
  { label: "≥ R$ 1M", min: 1_000_000, max: Number.MAX_SAFE_INTEGER },
  { label: "≥ R$ 3M", min: 3_000_000, max: Number.MAX_SAFE_INTEGER },
];

function buildContactValue(lead: Lead, channel: DispatchChannel): string | null {
  return normalizeContact(channel === "whatsapp" ? lead.phone : lead.email, channel);
}

function cnaeKey(cnae: string): string {
  return cnae.replace(/[-/]/g, "");
}

export function LeadSelector({
  selectedIds,
  onSelectionChange,
  sessionLeads,
  channel,
}: LeadSelectorProps) {
  const [source, setSource] = useState<"session" | "saved">("saved");
  const [savedLeads, setSavedLeads] = useState<Lead[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Filter state
  const [selectedUFs, setSelectedUFs] = useState<Set<string>>(new Set());
  const [selectedCnaes, setSelectedCnaes] = useState<Set<string>>(new Set());
  const [cityFilter, setCityFilter] = useState("");
  const [hasPhone, setHasPhone] = useState(false);
  const [hasEmail, setHasEmail] = useState(false);
  const [hasWebsite, setHasWebsite] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [revenueBucket, setRevenueBucket] = useState(0);
  const [dispatchFilter, setDispatchFilter] = useState<DispatchFilter>("never");

  // Dedup data — set of contact_value strings for current channel
  const [dispatchedContacts, setDispatchedContacts] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    let cancelled = false;
    fetchAllDispatchedContacts().then((res) => {
      if (cancelled) return;
      setDispatchedContacts(res.byChannel[channel]);
    });
    return () => {
      cancelled = true;
    };
  }, [channel]);

  useEffect(() => {
    if (source !== "saved") return;
    setLoadingSaved(true);

    const loadAll = async () => {
      const PAGE = 1000;
      let all: any[] = [];
      let from = 0;

      while (true) {
        const { data, error } = await supabase
          .from("leads")
          .select("*")
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);

        if (error) {
          toast.error("Erro ao carregar leads salvos.");
          break;
        }
        if (!data || data.length === 0) break;
        all = [...all, ...data];
        if (data.length < PAGE) break;
        from += PAGE;
      }

      const mapped: Lead[] = all.map((row: any) => ({
        id: row.id,
        companyName: row.company_name ?? "Empresa",
        cnae: row.cnae_code ?? "",
        estimatedRevenue: Number(row.faturamento_est ?? 0),
        city: row.raw?.city ?? "",
        state: row.uf ?? "",
        phone: row.raw?.phone ?? "",
        email: row.raw?.email ?? "",
        status: row.status ?? "found",
        cnpj: row.raw?.cnpj ?? row.id,
        website: row.raw?.website,
        address: row.raw?.address,
        rating: row.raw?.rating,
        reviewsCount: row.raw?.reviewsCount,
      }));
      setSavedLeads(mapped);
      setLoadingSaved(false);
    };

    loadAll();
  }, [source]);

  const baseLeads = source === "saved" ? savedLeads : sessionLeads;

  // Derive available UFs from loaded leads
  const availableUFs = useMemo(() => {
    const set = new Set<string>();
    baseLeads.forEach((l) => {
      if (l.state) set.add(l.state);
    });
    return Array.from(set).sort();
  }, [baseLeads]);

  const filtered = useMemo(() => {
    const revBucket = REVENUE_BUCKETS[revenueBucket];
    const needle = search.toLowerCase().trim();
    const cityNeedle = cityFilter.toLowerCase().trim();

    return baseLeads.filter((l) => {
      // search
      if (needle && !l.companyName.toLowerCase().includes(needle)) return false;

      // UF
      if (selectedUFs.size > 0 && !selectedUFs.has(l.state)) return false;

      // CNAE
      if (selectedCnaes.size > 0 && !selectedCnaes.has(cnaeKey(l.cnae))) {
        return false;
      }

      // city
      if (cityNeedle && !(l.city ?? "").toLowerCase().includes(cityNeedle)) {
        return false;
      }

      // contact toggles
      if (hasPhone && !l.phone) return false;
      if (hasEmail && !l.email) return false;
      if (hasWebsite && !l.website) return false;

      // rating
      if (minRating > 0 && (!l.rating || l.rating < minRating)) return false;

      // revenue
      if (l.estimatedRevenue < revBucket.min) return false;

      // dispatch status
      if (dispatchFilter !== "any") {
        const contact = buildContactValue(l, channel);
        const wasDispatched = !!contact && dispatchedContacts.has(contact);
        if (dispatchFilter === "never" && wasDispatched) return false;
        if (dispatchFilter === "previously" && !wasDispatched) return false;
      }

      return true;
    });
  }, [
    baseLeads,
    search,
    selectedUFs,
    selectedCnaes,
    cityFilter,
    hasPhone,
    hasEmail,
    hasWebsite,
    minRating,
    revenueBucket,
    dispatchFilter,
    dispatchedContacts,
    channel,
  ]);

  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next, baseLeads);
  };

  const selectAll = () => {
    const next = new Set(selectedIds);
    filtered.forEach((l) => next.add(l.id));
    onSelectionChange(next, baseLeads);
  };

  const clearAll = () => onSelectionChange(new Set(), baseLeads);

  const toggleUF = (uf: string) => {
    const next = new Set(selectedUFs);
    if (next.has(uf)) next.delete(uf);
    else next.add(uf);
    setSelectedUFs(next);
  };

  const toggleCnae = (code: string) => {
    const next = new Set(selectedCnaes);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setSelectedCnaes(next);
  };

  const resetFilters = () => {
    setSelectedUFs(new Set());
    setSelectedCnaes(new Set());
    setCityFilter("");
    setHasPhone(false);
    setHasEmail(false);
    setHasWebsite(false);
    setMinRating(0);
    setRevenueBucket(0);
    setDispatchFilter("never");
  };

  const activeFilterCount =
    selectedUFs.size +
    selectedCnaes.size +
    (cityFilter ? 1 : 0) +
    (hasPhone ? 1 : 0) +
    (hasEmail ? 1 : 0) +
    (hasWebsite ? 1 : 0) +
    (minRating > 0 ? 1 : 0) +
    (revenueBucket > 0 ? 1 : 0) +
    (dispatchFilter !== "never" ? 1 : 0);

  const dispatchedInSelection = useMemo(() => {
    let count = 0;
    baseLeads.forEach((l) => {
      if (!selectedIds.has(l.id)) return;
      const contact = buildContactValue(l, channel);
      if (contact && dispatchedContacts.has(contact)) count++;
    });
    return count;
  }, [baseLeads, selectedIds, dispatchedContacts, channel]);

  return (
    <div className="space-y-3">
      {/* Source toggle */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={source === "saved" ? "default" : "outline"}
          onClick={() => setSource("saved")}
        >
          Salvos
        </Button>
        <Button
          size="sm"
          variant={source === "session" ? "default" : "outline"}
          onClick={() => setSource("session")}
        >
          Sessão atual
        </Button>
      </div>

      {/* Search + actions */}
      <div className="flex gap-2">
        <Input
          placeholder="Buscar empresa..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm"
        />
        <Button size="sm" variant="outline" onClick={selectAll}>
          Selecionar todos ({filtered.length})
        </Button>
        {selectedIds.size > 0 && (
          <Button size="sm" variant="ghost" onClick={clearAll}>
            Limpar
          </Button>
        )}
      </div>

      {/* Filter panel */}
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <CollapsibleTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="w-full justify-between h-8 px-2 text-xs"
          >
            <span className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5" />
              Filtros avançados
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                  {activeFilterCount}
                </Badge>
              )}
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                filtersOpen && "rotate-180",
              )}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2 pb-1">
          {/* UF */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Estado (UF)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full justify-between h-8 text-xs font-normal"
                >
                  {selectedUFs.size === 0
                    ? "Todos os estados"
                    : `${selectedUFs.size} UF${selectedUFs.size > 1 ? "s" : ""}`}
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="start">
                <ScrollArea className="h-48">
                  <div className="space-y-0.5">
                    {availableUFs.length === 0 && (
                      <p className="text-xs text-muted-foreground p-2">
                        Sem estados nos leads carregados.
                      </p>
                    )}
                    {availableUFs.map((uf) => (
                      <label
                        key={uf}
                        className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-xs"
                      >
                        <Checkbox
                          checked={selectedUFs.has(uf)}
                          onCheckedChange={() => toggleUF(uf)}
                        />
                        <span>{uf}</span>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </div>

          {/* CNAE */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">CNAE</Label>
            <div className="flex flex-wrap gap-1.5">
              {CNAE_OPTIONS.map((opt) => (
                <Badge
                  key={opt.code}
                  variant={selectedCnaes.has(opt.code) ? "default" : "outline"}
                  className="cursor-pointer text-xs"
                  onClick={() => toggleCnae(opt.code)}
                >
                  {opt.label}
                </Badge>
              ))}
            </div>
          </div>

          {/* City */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Cidade</Label>
            <Input
              placeholder="Filtrar por cidade..."
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          {/* Contact toggles */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Contatos disponíveis
            </Label>
            <div className="space-y-1.5">
              <ToggleRow
                icon={<Phone className="h-3.5 w-3.5" />}
                label="Tem telefone"
                checked={hasPhone}
                onChange={setHasPhone}
              />
              <ToggleRow
                icon={<Mail className="h-3.5 w-3.5" />}
                label="Tem email"
                checked={hasEmail}
                onChange={setHasEmail}
              />
              <ToggleRow
                icon={<Globe className="h-3.5 w-3.5" />}
                label="Tem website"
                checked={hasWebsite}
                onChange={setHasWebsite}
              />
            </div>
          </div>

          {/* Rating */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5" />
                Rating mínimo
              </span>
              <span className="font-mono">{minRating.toFixed(1)}</span>
            </Label>
            <Slider
              value={[minRating]}
              onValueChange={(v) => setMinRating(v[0])}
              max={5}
              step={0.5}
            />
          </div>

          {/* Revenue */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Faturamento estimado
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {REVENUE_BUCKETS.map((b, i) => (
                <Badge
                  key={b.label}
                  variant={revenueBucket === i ? "default" : "outline"}
                  className="cursor-pointer text-xs"
                  onClick={() => setRevenueBucket(i)}
                >
                  {b.label}
                </Badge>
              ))}
            </div>
          </div>

          {/* Dispatch status */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Histórico de disparo ({channel})
            </Label>
            <div className="flex gap-1.5">
              {(
                [
                  { val: "never", label: "Nunca disparado" },
                  { val: "previously", label: "Já disparado" },
                  { val: "any", label: "Todos" },
                ] as const
              ).map((opt) => (
                <Badge
                  key={opt.val}
                  variant={dispatchFilter === opt.val ? "default" : "outline"}
                  className="cursor-pointer text-xs"
                  onClick={() => setDispatchFilter(opt.val)}
                >
                  {opt.label}
                </Badge>
              ))}
            </div>
          </div>

          {activeFilterCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={resetFilters}
              className="h-7 text-xs w-full"
            >
              <X className="h-3 w-3 mr-1" /> Limpar filtros
            </Button>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Selected count + dedup warning */}
      <div className="flex items-center gap-2 flex-wrap">
        {selectedIds.size > 0 && (
          <Badge variant="secondary">
            {selectedIds.size} selecionado{selectedIds.size !== 1 ? "s" : ""}
          </Badge>
        )}
        {dispatchedInSelection > 0 && (
          <Badge variant="outline" className="text-warning-muted-foreground bg-warning-muted border-warning-muted-foreground/20">
            <AlertCircle className="h-3 w-3 mr-1" />
            {dispatchedInSelection} já receberam mensagem
          </Badge>
        )}
      </div>

      {/* Lead list */}
      <ScrollArea className="h-72 rounded border">
        {loadingSaved ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-4">
            Carregando leads...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-4 text-center">
            {source === "session"
              ? "Leads de sessão disponíveis apenas na página principal."
              : activeFilterCount > 0 || search
              ? "Nenhum lead corresponde aos filtros atuais."
              : "Nenhum lead encontrado."}
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filtered.map((lead) => {
              const contact = buildContactValue(lead, channel);
              const wasDispatched =
                !!contact && dispatchedContacts.has(contact);
              return (
                <label
                  key={lead.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm"
                >
                  <Checkbox
                    checked={selectedIds.has(lead.id)}
                    onCheckedChange={() => toggle(lead.id)}
                  />
                  <span className="flex-1 truncate">
                    {lead.companyName}
                    {wasDispatched && (
                      <span className="ml-2 text-xs text-warning-muted-foreground">
                        • já disparado
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {lead.city || lead.state}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function ToggleRow({
  icon,
  label,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between text-xs cursor-pointer">
      <span className="flex items-center gap-2 text-muted-foreground">
        {icon}
        {label}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
