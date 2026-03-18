import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchConversationMessages,
  fetchPipelineLeads,
  fetchPipelineStages,
  markPipelineLeadAsRead,
  movePipelineLeadStage,
  sendPipelineMessage,
  updatePipelineStage,
  createPipelineStage,
} from "@/lib/api/pipeline";
import { ConversationMessage, PipelineLead, PipelineStage } from "@/lib/pipeline/types";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, MessageSquareText, Settings2, Send, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

function formatTimestamp(value: string | null) {
  if (!value) {
    return "Sem interação";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

const Pipeline = () => {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [leads, setLeads] = useState<PipelineLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<PipelineLead | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [composer, setComposer] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [stageDialogOpen, setStageDialogOpen] = useState(false);
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [newStageName, setNewStageName] = useState("");
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);

  const loadPipeline = useCallback(async () => {
    setLoading(true);
    try {
      const [stageData, leadData] = await Promise.all([
        fetchPipelineStages({ includeInactive: true }),
        fetchPipelineLeads(),
      ]);
      setStages(stageData);
      setLeads(leadData);
    } catch (error) {
      toast.error("Erro ao carregar o pipeline.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConversation = useCallback(async (lead: PipelineLead) => {
    setMessagesLoading(true);
    try {
      const [conversation] = await Promise.all([
        fetchConversationMessages(lead.id),
        markPipelineLeadAsRead(lead.id),
      ]);
      setMessages(conversation);
      setLeads((current) =>
        current.map((item) =>
          item.id === lead.id ? { ...item, unreadCount: 0 } : item
        )
      );
    } catch (error) {
      toast.error("Erro ao carregar a conversa do lead.");
      console.error(error);
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPipeline();
  }, [loadPipeline]);

  // Realtime: conversa do lead aberto + mudanças do próprio lead (stage/unread/preview)
  useEffect(() => {
    // Cancela subscription anterior
    if (realtimeChannelRef.current) {
      void supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    if (!selectedLead) return;

    const leadId = selectedLead.id;
    const stagesById = new Map(stages.map((s) => [s.id, s]));

    const channel = supabase
      .channel(`pipeline:${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_messages",
          filter: `pipeline_lead_id=eq.${leadId}`,
        },
        (payload) => {
          const row = payload.new as any;
          const newMsg: ConversationMessage = {
            id: row.id,
            pipelineLeadId: row.pipeline_lead_id,
            channel: row.channel,
            direction: row.direction,
            providerMessageId: row.provider_message_id,
            body: row.body,
            status: row.status,
            metadata: row.metadata,
            createdAt: row.created_at,
          };

          setMessages((prev) => {
            // Evita duplicar caso o INSERT chegue depois do fetch inicial
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            const merged = [...prev, newMsg];
            return merged.sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );
          });

          // Fallback: atualiza preview (kanban + drawer) só com base na mensagem.
          // unread_count e stage virão do UPDATE em `pipeline_leads` (assinatura separada).
          setLeads((prev) =>
            prev.map((l) =>
              l.id === leadId
                ? {
                    ...l,
                    latestMessagePreview: row.body ?? l.latestMessagePreview,
                    latestMessageAt: row.created_at ?? l.latestMessageAt,
                    latestDirection: (row.direction as any) ?? l.latestDirection,
                  }
                : l
            )
          );
          setSelectedLead((current) => {
            if (!current || current.id !== leadId) return current;
            return {
              ...current,
              latestMessagePreview: row.body ?? current.latestMessagePreview,
              latestMessageAt: row.created_at ?? current.latestMessageAt,
              latestDirection: (row.direction as any) ?? current.latestDirection,
            };
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_messages",
          filter: `pipeline_lead_id=eq.${leadId}`,
        },
        (payload) => {
          const row = payload.new as any;
          const updatedMsg: ConversationMessage = {
            id: row.id,
            pipelineLeadId: row.pipeline_lead_id,
            channel: row.channel,
            direction: row.direction,
            providerMessageId: row.provider_message_id,
            body: row.body,
            status: row.status,
            metadata: row.metadata,
            createdAt: row.created_at,
          };

          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === updatedMsg.id);
            const merged =
              idx === -1
                ? [...prev, updatedMsg]
                : prev.map((m) => (m.id === updatedMsg.id ? updatedMsg : m));
            return merged.sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );
          });

          // Fallback semelhante ao INSERT
          setLeads((prev) =>
            prev.map((l) =>
              l.id === leadId
                ? {
                    ...l,
                    latestMessagePreview: row.body ?? l.latestMessagePreview,
                    latestMessageAt: row.created_at ?? l.latestMessageAt,
                    latestDirection: (row.direction as any) ?? l.latestDirection,
                  }
                : l
            )
          );
          setSelectedLead((current) => {
            if (!current || current.id !== leadId) return current;
            return {
              ...current,
              latestMessagePreview: row.body ?? current.latestMessagePreview,
              latestMessageAt: row.created_at ?? current.latestMessageAt,
              latestDirection: (row.direction as any) ?? current.latestDirection,
            };
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pipeline_leads",
          filter: `id=eq.${leadId}`,
        },
        (payload) => {
          const row = payload.new as any;
          const stage = stagesById.get(row.current_stage_id);

          // Atualiza o kanban
          setLeads((prev) =>
            prev.map((l) =>
              l.id === leadId
                ? {
                    ...l,
                    currentStageId: row.current_stage_id,
                    currentStageKey: stage?.key ?? l.currentStageKey,
                    currentStageName: stage?.name ?? l.currentStageName,
                    latestMessagePreview: row.latest_message_preview ?? l.latestMessagePreview,
                    latestMessageAt: row.latest_message_at ?? l.latestMessageAt,
                    latestDirection: (row.latest_direction as any) ?? l.latestDirection,
                    unreadCount: Number(row.unread_count ?? 0),
                  }
                : l
            )
          );

          // Atualiza o drawer (select + última interação + badge interna, se existir)
          setSelectedLead((current) => {
            if (!current || current.id !== leadId) return current;
            return {
              ...current,
              currentStageId: row.current_stage_id,
              currentStageKey: stage?.key ?? current.currentStageKey,
              currentStageName: stage?.name ?? current.currentStageName,
              latestMessagePreview: row.latest_message_preview ?? current.latestMessagePreview,
              latestMessageAt: row.latest_message_at ?? current.latestMessageAt,
              latestDirection: (row.latest_direction as any) ?? current.latestDirection,
              unreadCount: Number(row.unread_count ?? 0),
            };
          });
        }
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      void supabase.removeChannel(channel);
      realtimeChannelRef.current = null;
    };
  }, [selectedLead?.id, stages]);

  const groupedLeads = useMemo(() => {
    return stages.filter((stage) => stage.isActive).map((stage) => ({
      stage,
      leads: leads.filter((lead) => lead.currentStageId === stage.id),
    }));
  }, [leads, stages]);

  const openLead = async (lead: PipelineLead) => {
    setSelectedLead(lead);
    await loadConversation(lead);
  };

  const handleDropOnStage = async (stageId: string) => {
    if (!draggedLeadId) {
      return;
    }

    try {
      await movePipelineLeadStage(draggedLeadId, stageId);
      setLeads((current) =>
        current.map((lead) =>
          lead.id === draggedLeadId ? { ...lead, currentStageId: stageId } : lead
        )
      );
    } catch (error) {
      toast.error("Não foi possível mover o lead.");
      console.error(error);
    } finally {
      setDraggedLeadId(null);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedLead || !composer.trim()) {
      return;
    }

    setSendingMessage(true);
    try {
      const result = await sendPipelineMessage({
        pipelineLead: selectedLead,
        body: composer.trim(),
      });

      if (!result.success) {
        toast.error(result.error ?? "Erro ao enviar mensagem.");
        return;
      }

      setComposer("");
      await Promise.all([loadPipeline(), loadConversation(selectedLead)]);
      toast.success("Mensagem enviada para o lead.");
    } catch (error) {
      toast.error("Erro ao enviar mensagem.");
      console.error(error);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleRenameStage = async (stage: PipelineStage, name: string) => {
    try {
      await updatePipelineStage(stage.id, { name });
      setStages((current) =>
        current.map((item) => (item.id === stage.id ? { ...item, name } : item))
      );
    } catch (error) {
      toast.error("Erro ao atualizar a etapa.");
      console.error(error);
    }
  };

  const handleToggleStage = async (stage: PipelineStage) => {
    try {
      await updatePipelineStage(stage.id, { isActive: !stage.isActive });
      await loadPipeline();
    } catch (error) {
      toast.error("Erro ao atualizar a etapa.");
      console.error(error);
    }
  };

  const handleCreateStage = async () => {
    if (!newStageName.trim()) {
      return;
    }

    try {
      await createPipelineStage(newStageName.trim());
      setNewStageName("");
      await loadPipeline();
    } catch (error) {
      toast.error("Erro ao criar a etapa.");
      console.error(error);
    }
  };

  const handleStageChangeFromDrawer = async (stageId: string) => {
    if (!selectedLead) {
      return;
    }

    try {
      await movePipelineLeadStage(selectedLead.id, stageId);
      const targetStage = stages.find((stage) => stage.id === stageId);
      if (!targetStage) {
        return;
      }

      setLeads((current) =>
        current.map((lead) =>
          lead.id === selectedLead.id
            ? {
                ...lead,
                currentStageId: targetStage.id,
                currentStageKey: targetStage.key,
                currentStageName: targetStage.name,
              }
            : lead
        )
      );
      setSelectedLead((current) =>
        current
          ? {
              ...current,
              currentStageId: targetStage.id,
              currentStageKey: targetStage.key,
              currentStageName: targetStage.name,
            }
          : current
      );
    } catch (error) {
      toast.error("Erro ao mover a etapa do lead.");
      console.error(error);
    }
  };

  const handleReorderStage = async (stageId: string, direction: -1 | 1) => {
    const orderedStages = [...stages].sort((a, b) => a.position - b.position);
    const index = orderedStages.findIndex((stage) => stage.id === stageId);
    const swapIndex = index + direction;

    if (index === -1 || swapIndex < 0 || swapIndex >= orderedStages.length) {
      return;
    }

    const currentStage = orderedStages[index];
    const swapStage = orderedStages[swapIndex];

    try {
      await updatePipelineStage(currentStage.id, { position: swapStage.position });
      await updatePipelineStage(swapStage.id, { position: currentStage.position });
      await loadPipeline();
    } catch (error) {
      toast.error("Erro ao reordenar as etapas.");
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="ml-64 space-y-6 p-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <MessageSquareText className="h-6 w-6 text-primary" />
              Pipeline de Leads
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Administre os leads após o disparo, acompanhe a conversa e mova cada oportunidade pelo funil.
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={() => void loadPipeline()}>
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </Button>
            <Button className="gap-2" onClick={() => setStageDialogOpen(true)}>
              <Settings2 className="h-4 w-4" />
              Configurar etapas
            </Button>
          </div>
        </header>

        {loading ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Carregando pipeline...
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 xl:grid-cols-5 md:grid-cols-2">
            {groupedLeads.map(({ stage, leads: stageLeads }) => (
              <section
                key={stage.id}
                className="min-h-[420px] rounded-2xl border bg-card/80 p-3"
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => void handleDropOnStage(stage.id)}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold">{stage.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      {stageLeads.length} lead{stageLeads.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: stage.color ?? "#94A3B8" }}
                  />
                </div>

                <div className="space-y-3">
                  {stageLeads.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
                      Nenhum lead nesta etapa.
                    </div>
                  ) : (
                    stageLeads.map((lead) => (
                      <button
                        key={lead.id}
                        type="button"
                        draggable
                        onDragStart={() => setDraggedLeadId(lead.id)}
                        onClick={() => void openLead(lead)}
                        className="w-full rounded-2xl border bg-background p-4 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{lead.leadSnapshot.companyName}</p>
                            <p className="text-xs text-muted-foreground">
                              {lead.contactPhone || lead.contactEmail || "Sem contato"}
                            </p>
                          </div>
                          {lead.unreadCount > 0 ? (
                            <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                              {lead.unreadCount} novo{lead.unreadCount > 1 ? "s" : ""}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-3 line-clamp-3 text-sm text-foreground/90">
                          {lead.latestMessagePreview || "Sem mensagem registrada ainda."}
                        </p>
                        <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                          {formatTimestamp(lead.latestMessageAt)}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      <Sheet open={selectedLead !== null} onOpenChange={(open) => !open && setSelectedLead(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl">
          {selectedLead ? (
            <div className="flex h-full flex-col gap-6">
              <SheetHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <SheetTitle>Conversa do lead</SheetTitle>
                    <SheetDescription>
                      {selectedLead.leadSnapshot.companyName} • {selectedLead.contactPhone || selectedLead.contactEmail}
                    </SheetDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void loadConversation(selectedLead)}
                    disabled={messagesLoading}
                    title="Atualizar conversa"
                  >
                    <RefreshCw className={`h-4 w-4 ${messagesLoading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </SheetHeader>

              <div className="grid gap-4 rounded-2xl border bg-muted/20 p-4 md:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Etapa atual</p>
                  <div className="mt-2">
                    <Select
                      value={selectedLead.currentStageId}
                      onValueChange={(value) => void handleStageChangeFromDrawer(value)}
                    >
                      <SelectTrigger aria-label="Etapa do lead">
                        <SelectValue placeholder="Selecione a etapa" />
                      </SelectTrigger>
                      <SelectContent>
                        {stages
                          .filter((stage) => stage.isActive)
                          .map((stage) => (
                            <SelectItem key={stage.id} value={stage.id}>
                              {stage.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Última interação</p>
                  <p className="mt-1 text-sm font-medium">{formatTimestamp(selectedLead.latestMessageAt)}</p>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl border bg-background p-4">
                {messagesLoading ? (
                  <p className="text-sm text-muted-foreground">Carregando conversa...</p>
                ) : messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma mensagem nesta conversa ainda.</p>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`max-w-[85%] rounded-3xl px-4 py-3 text-sm ${
                        message.direction === "outbound"
                          ? "ml-auto rounded-br-md bg-primary text-primary-foreground"
                          : "rounded-bl-md border bg-muted/30"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.body}</p>
                      <p
                        className={`mt-2 text-[10px] uppercase tracking-[0.18em] ${
                          message.direction === "outbound"
                            ? "text-primary-foreground/80"
                            : "text-muted-foreground"
                        }`}
                      >
                        {message.direction === "outbound" ? "Enviado" : "Recebido"} • {formatTimestamp(message.createdAt)}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-3">
                <Textarea
                  aria-label="Nova mensagem do lead"
                  value={composer}
                  onChange={(event) => setComposer(event.target.value)}
                  placeholder="Digite a próxima mensagem para o lead..."
                  className="min-h-[120px]"
                />
                <div className="flex justify-end">
                  <Button
                    className="gap-2"
                    onClick={() => void handleSendMessage()}
                    disabled={sendingMessage || !composer.trim()}
                  >
                    <Send className="h-4 w-4" />
                    {sendingMessage ? "Enviando..." : "Enviar mensagem"}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={stageDialogOpen} onOpenChange={setStageDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Configurar etapas</DialogTitle>
            <DialogDescription>
              Renomeie as etapas padrão, ative ou desative colunas e crie novas fases para o funil.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-3">
              {stages.map((stage) => (
                <Card key={stage.id}>
                  <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                    <div className="flex-1 space-y-2">
                      <Label htmlFor={`stage-${stage.id}`}>Nome da etapa</Label>
                      <Input
                        id={`stage-${stage.id}`}
                        value={stage.name}
                        onChange={(event) =>
                          setStages((current) =>
                            current.map((item) =>
                              item.id === stage.id ? { ...item, name: event.target.value } : item
                            )
                          )
                        }
                        onBlur={(event) => void handleRenameStage(stage, event.target.value)}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => void handleReorderStage(stage.id, -1)}
                        aria-label={`Mover ${stage.name} para cima`}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => void handleReorderStage(stage.id, 1)}
                        aria-label={`Mover ${stage.name} para baixo`}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" onClick={() => void handleToggleStage(stage)}>
                        {stage.isActive ? "Desativar" : "Ativar"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Nova etapa</CardTitle>
                <CardDescription>
                  Crie uma coluna adicional para acompanhar outra fase do processo comercial.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 md:flex-row">
                <Input
                  value={newStageName}
                  onChange={(event) => setNewStageName(event.target.value)}
                  placeholder="Nome da nova etapa"
                />
                <Button onClick={() => void handleCreateStage()} disabled={!newStageName.trim()}>
                  Criar etapa
                </Button>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Pipeline;
