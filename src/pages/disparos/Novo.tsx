import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";
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
import { normalizeContact, interpolate, buildContentVariables } from "@/lib/dispatch/utils";
import { sendMessage } from "@/lib/api/sendMessage";
import { registerDispatchToPipeline } from "@/lib/api/pipeline";
import { checkRecentlyDispatched } from "@/lib/api/dispatchHistory";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Send, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const DEDUP_WINDOW_DAYS = 30;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function prefixLeadId(lead: Lead, source: "saved" | "session"): string {
  return `${source}:${lead.id}`;
}

export default function Novo() {
  const location = useLocation();
  const routeState = location.state as {
    preselectedLead?: Lead;
    channel?: DispatchChannel;
    preselectedTemplateId?: string;
    resendNotice?: string;
  } | null;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    routeState?.preselectedLead
      ? new Set([routeState.preselectedLead.id])
      : new Set(),
  );
  const [allLoadedLeads, setAllLoadedLeads] = useState<Lead[]>(
    routeState?.preselectedLead ? [routeState.preselectedLead] : [],
  );
  const leadSource = "saved" as const;

  const [channel, setChannel] = useState<DispatchChannel>(
    routeState?.channel ?? "whatsapp",
  );
  const [selectedTemplate, setSelectedTemplate] =
    useState<MessageTemplate | null>(null);

  const [dispatchItems, setDispatchItems] = useState<DispatchItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  const isCancelledRef = useRef(false);

  // Dedup confirmation dialog
  const [dedupDialogOpen, setDedupDialogOpen] = useState(false);
  const [dedupContactsCount, setDedupContactsCount] = useState(0);
  const [dedupResolver, setDedupResolver] = useState<
    ((decision: "skip" | "force" | "cancel") => void) | null
  >(null);

  const handleSelectionChange = useCallback(
    (ids: Set<string>, currentLeads: Lead[]) => {
      setSelectedIds(ids);
      setAllLoadedLeads(currentLeads);
    },
    [],
  );

  useEffect(() => {
    if (routeState?.preselectedLead) {
      toast.info(`Lead "${routeState.preselectedLead.companyName}" pré-selecionado.`);
    }
    if (routeState?.resendNotice) {
      toast.warning(routeState.resendNotice, { duration: 8000 });
    }
    // Auto-load preselected template (e.g. coming from Histórico → Reenviar)
    if (routeState?.preselectedTemplateId) {
      (async () => {
        const { data } = await (supabase as any)
          .from("message_templates")
          .select("*")
          .eq("id", routeState.preselectedTemplateId)
          .maybeSingle();
        if (data) setSelectedTemplate(data as MessageTemplate);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sentCount = dispatchItems.filter((i) => i.status === "sent").length;
  const failedCount = dispatchItems.filter((i) => i.status === "failed").length;

  const selectedLeads = allLoadedLeads.filter((l) => selectedIds.has(l.id));

  const missingContact = selectedLeads.filter(
    (l) => !normalizeContact(channel === "whatsapp" ? l.phone : l.email, channel),
  ).length;

  const askDedupDecision = (count: number) =>
    new Promise<"skip" | "force" | "cancel">((resolve) => {
      setDedupContactsCount(count);
      setDedupResolver(() => resolve);
      setDedupDialogOpen(true);
    });

  const handleDedupChoice = (choice: "skip" | "force" | "cancel") => {
    setDedupDialogOpen(false);
    if (dedupResolver) {
      dedupResolver(choice);
      setDedupResolver(null);
    }
  };

  const startDispatch = async () => {
    if (!selectedTemplate || selectedIds.size === 0) return;

    // 1) Pre-flight dedup check
    const contacts = selectedLeads
      .map((l) => normalizeContact(channel === "whatsapp" ? l.phone : l.email, channel))
      .filter((c): c is string => !!c);

    let blockedContacts = new Set<string>();
    if (contacts.length > 0) {
      blockedContacts = await checkRecentlyDispatched(
        contacts,
        channel,
        DEDUP_WINDOW_DAYS,
      );
    }

    let leadsToProcess = selectedLeads;
    if (blockedContacts.size > 0) {
      const decision = await askDedupDecision(blockedContacts.size);
      if (decision === "cancel") return;
      if (decision === "skip") {
        leadsToProcess = selectedLeads.filter((l) => {
          const c = normalizeContact(
            channel === "whatsapp" ? l.phone : l.email,
            channel,
          );
          return !c || !blockedContacts.has(c);
        });
        if (leadsToProcess.length === 0) {
          toast.info("Todos os leads selecionados já receberam mensagem recentemente.");
          return;
        }
      }
      // 'force' → keep leadsToProcess as-is
    }

    isPausedRef.current = false;
    isCancelledRef.current = false;
    setIsPaused(false);
    setIsRunning(true);

    const queue: DispatchItem[] = leadsToProcess.map((lead) => ({
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
            idx >= i ? { ...item, status: "cancelled" } : item,
          ),
        );
        break;
      }

      const lead = queue[i].lead;
      const contactRaw = channel === "whatsapp" ? lead.phone : lead.email;
      const contact = normalizeContact(contactRaw, channel);

      if (!contact) {
        updateItem(i, { status: "cancelled" });
        await persistLog(lead, selectedTemplate, channel, "cancelled", {
          contactValue: null,
        });
        await sleep(100);
        continue;
      }

      updateItem(i, { status: "sending" });

      const message = interpolate(selectedTemplate.body, lead);
      const subject = selectedTemplate.subject
        ? interpolate(selectedTemplate.subject, lead)
        : undefined;

      // HSM dispatch: when the template is pre-approved by Meta, send via
      // ContentSid + ContentVariables so it works outside the 24h window.
      // Freeform fallback (without contentSid) keeps current behavior.
      const isHsm = !!selectedTemplate.is_hsm && !!selectedTemplate.content_sid;
      const result = await sendMessage({
        channel,
        to: contact,
        message,
        subject,
        ...(isHsm && {
          contentSid: selectedTemplate.content_sid as string,
          contentVariables: buildContentVariables(
            selectedTemplate.variable_keys ?? [],
            lead,
          ),
        }),
      });

      if (result.success) {
        const providerSid =
          typeof result.data?.sid === "string" ? result.data.sid : null;
        const providerStatus =
          typeof result.data?.status === "string" ? result.data.status : null;

        updateItem(i, { status: "sent" });
        const dispatchLogId = await persistLog(
          lead,
          selectedTemplate,
          channel,
          "sent",
          {
            contactValue: contact,
            providerMessageId: providerSid,
            providerStatus,
          },
        );

        try {
          await registerDispatchToPipeline({
            lead,
            leadSource,
            channel,
            dispatchLogId,
            messageBody: message,
            providerData: result.data,
          });
        } catch (pipelineError) {
          console.error("pipeline sync error:", pipelineError);
        }
      } else {
        updateItem(i, { status: "failed", error: result.error });
        toast.error(result.error ?? "Erro ao enviar mensagem.");
        await persistLog(lead, selectedTemplate, channel, "failed", {
          contactValue: contact,
          errorMsg: result.error,
        });
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
    extras: {
      contactValue?: string | null;
      providerMessageId?: string | null;
      providerStatus?: string | null;
      errorMsg?: string;
    } = {},
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
      contact_value: extras.contactValue ?? null,
      provider_message_id: extras.providerMessageId ?? null,
      provider_status: extras.providerStatus ?? null,
      ...(status === "sent" && { sent_at: new Date().toISOString() }),
      ...(extras.errorMsg && { error_msg: extras.errorMsg }),
    };
    const { data, error } = await (supabase as any)
      .from("dispatch_logs")
      .insert(log)
      .select("id")
      .single();

    if (error) throw error;
    return (data?.id as string | undefined) ?? null;
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
    <>
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
            channel={channel}
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

        <Button onClick={startDispatch} disabled={!canDispatch} className="gap-2">
          <Send className="h-4 w-4" />
          Iniciar Disparo ({selectedIds.size} lead
          {selectedIds.size !== 1 ? "s" : ""})
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

      <AlertDialog open={dedupDialogOpen} onOpenChange={setDedupDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leads já receberam mensagem</AlertDialogTitle>
            <AlertDialogDescription>
              {dedupContactsCount} lead
              {dedupContactsCount > 1 ? "s" : ""} já receberam mensagem nos últimos{" "}
              {DEDUP_WINDOW_DAYS} dias por <strong>{channel}</strong>. O que fazer?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={() => handleDedupChoice("cancel")}>
              Cancelar disparo
            </AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => handleDedupChoice("force")}
            >
              Forçar reenvio
            </Button>
            <AlertDialogAction onClick={() => handleDedupChoice("skip")}>
              Pular esses leads
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
