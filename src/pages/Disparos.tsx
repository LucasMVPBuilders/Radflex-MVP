import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { LeadSelector } from "@/components/disparos/LeadSelector";
import { TemplateEditor } from "@/components/disparos/TemplateEditor";
import { DispatchProgress } from "@/components/disparos/DispatchProgress";
import { Lead } from "@/data/types";
import {
  MessageTemplate,
  DispatchItem,
  DispatchChannel,
  DispatchLogInsert,
} from "@/lib/dispatch/types";
import { normalizeContact, interpolate } from "@/lib/dispatch/utils";
import { sendMessage } from "@/lib/api/sendMessage";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Send, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function prefixLeadId(lead: Lead, source: "saved" | "session"): string {
  return `${source}:${lead.id}`;
}

const Disparos = () => {
  const location = useLocation();
  const routeState = location.state as {
    preselectedLead?: Lead;
    channel?: DispatchChannel;
  } | null;

  // Se viemos do modal de detalhe com um lead pré-selecionado, inicializamos com ele
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    routeState?.preselectedLead ? new Set([routeState.preselectedLead.id]) : new Set()
  );
  const [allLoadedLeads, setAllLoadedLeads] = useState<Lead[]>(
    routeState?.preselectedLead ? [routeState.preselectedLead] : []
  );
  const leadSource = "saved" as const;

  const [channel, setChannel] = useState<DispatchChannel>(
    routeState?.channel ?? "whatsapp"
  );
  const [selectedTemplate, setSelectedTemplate] =
    useState<MessageTemplate | null>(null);

  const [dispatchItems, setDispatchItems] = useState<DispatchItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  const isCancelledRef = useRef(false);

  // Quando LeadSelector carregar os leads do banco, garante que o lead pré-selecionado
  // continue selecionado caso ele exista na lista (lead salvo)
  const handleSelectionChange = useCallback(
    (ids: Set<string>, currentLeads: Lead[]) => {
      setSelectedIds(ids);
      setAllLoadedLeads(currentLeads);
    },
    []
  );

  // Notifica o usuário quando chegou com um lead pré-selecionado
  useEffect(() => {
    if (routeState?.preselectedLead) {
      toast.info(`Lead "${routeState.preselectedLead.companyName}" pré-selecionado.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sentCount = dispatchItems.filter((i) => i.status === "sent").length;
  const failedCount = dispatchItems.filter((i) => i.status === "failed").length;

  // selectedLeads é sempre derivado — nunca cacheado separadamente
  const selectedLeads = allLoadedLeads.filter((l) => selectedIds.has(l.id));

  const missingContact = selectedLeads.filter(
    (l) =>
      !normalizeContact(
        channel === "whatsapp" ? l.phone : l.email,
        channel
      )
  ).length;

  const startDispatch = async () => {
    if (!selectedTemplate || selectedIds.size === 0) return;

    isPausedRef.current = false;
    isCancelledRef.current = false;
    setIsPaused(false);
    setIsRunning(true);

    const queue: DispatchItem[] = selectedLeads.map((lead) => ({
      lead,
      status: "pending",
    }));
    setDispatchItems(queue);

    const updateItem = (index: number, patch: Partial<DispatchItem>) => {
      setDispatchItems((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], ...patch };
        return next;
      });
    };

    for (let i = 0; i < queue.length; i++) {
      while (isPausedRef.current && !isCancelledRef.current) {
        await sleep(200);
      }
      if (isCancelledRef.current) {
        setDispatchItems((prev) =>
          prev.map((item, idx) =>
            idx >= i ? { ...item, status: "cancelled" } : item
          )
        );
        break;
      }

      const lead = queue[i].lead;
      const contactRaw =
        channel === "whatsapp" ? lead.phone : lead.email;
      const contact = normalizeContact(contactRaw, channel);

      if (!contact) {
        updateItem(i, { status: "cancelled" });
        await persistLog(lead, selectedTemplate, channel, "cancelled");
        await sleep(100);
        continue;
      }

      updateItem(i, { status: "sending" });

      const message = interpolate(selectedTemplate.body, lead);
      const subject = selectedTemplate.subject
        ? interpolate(selectedTemplate.subject, lead)
        : undefined;

      const result = await sendMessage({ channel, to: contact, message, subject });

      if (result.success) {
        updateItem(i, { status: "sent" });
        await persistLog(lead, selectedTemplate, channel, "sent");
      } else {
        updateItem(i, { status: "failed", error: result.error });
        await persistLog(lead, selectedTemplate, channel, "failed", result.error);
      }

      await sleep(500);
    }

    setIsRunning(false);
    isCancelledRef.current = false;
  };

  const persistLog = async (
    lead: Lead,
    template: MessageTemplate,
    ch: DispatchChannel,
    status: DispatchLogInsert["status"],
    errorMsg?: string
  ) => {
    const log: DispatchLogInsert = {
      template_id: template.id,
      lead_id: prefixLeadId(lead, leadSource),
      lead_snapshot: {
        companyName: lead.companyName,
        phone: lead.phone,
        email: lead.email,
        city: lead.city,
        state: lead.state,
        cnae: lead.cnae,
      },
      channel: ch,
      status,
      ...(status === "sent" && { sent_at: new Date().toISOString() }),
      ...(errorMsg && { error_msg: errorMsg }),
    };
    await (supabase as any).from("dispatch_logs").insert(log);
  };

  const handlePause = () => {
    isPausedRef.current = true;
    setIsPaused(true);
  };

  const handleResume = () => {
    isPausedRef.current = false;
    setIsPaused(false);
  };

  const handleCancel = () => {
    isCancelledRef.current = true;
    isPausedRef.current = false;
    setIsPaused(false);
    toast("Disparo cancelado.");
  };

  const previewLead = selectedLeads[0] ?? null;
  const canDispatch =
    selectedIds.size > 0 && selectedTemplate !== null && !isRunning;

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="ml-64 p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Send className="h-6 w-6 text-primary" />
            Disparos em Massa
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Selecione leads, configure um template e dispare via WhatsApp ou
            Email.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Lead selection */}
          <div className="rounded-lg border p-4 space-y-3">
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
              1. Selecionar Leads
            </h2>
            <LeadSelector
              selectedIds={selectedIds}
              onSelectionChange={handleSelectionChange}
              sessionLeads={[]}
            />
          </div>

          {/* Template config */}
          <div className="rounded-lg border p-4 space-y-3">
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
              2. Configurar Mensagem
            </h2>
            <TemplateEditor
              channel={channel}
              onChannelChange={setChannel}
              selectedTemplate={selectedTemplate}
              onTemplateChange={setSelectedTemplate}
              previewLead={previewLead}
            />
          </div>
        </div>

        {/* Dispatch section */}
        <div className="rounded-lg border p-4 space-y-4">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
            3. Disparar
          </h2>

          {missingContact > 0 && selectedIds.size > 0 && (
            <div className="flex items-center gap-2 text-sm text-warning-muted-foreground bg-warning-muted rounded px-3 py-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {missingContact} lead{missingContact > 1 ? "s" : ""} sem{" "}
              {channel === "whatsapp" ? "telefone válido" : "email válido"} —{" "}
              {missingContact > 1 ? "serão pulados" : "será pulado"}.
            </div>
          )}

          <Button
            onClick={startDispatch}
            disabled={!canDispatch}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            Iniciar Disparo ({selectedIds.size} lead{selectedIds.size !== 1 ? "s" : ""})
          </Button>

          {dispatchItems.length > 0 && (
            <DispatchProgress
              items={dispatchItems}
              isPaused={isPaused}
              isRunning={isRunning}
              sentCount={sentCount}
              failedCount={failedCount}
              onPause={handlePause}
              onResume={handleResume}
              onCancel={handleCancel}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default Disparos;
