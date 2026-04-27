import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MessageTemplate, DispatchChannel } from "@/lib/dispatch/types";
import { AVAILABLE_VARIABLE_KEYS } from "@/lib/dispatch/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Plus,
  Pencil,
  Trash2,
  MessageCircle,
  Mail,
  Shield,
  ExternalLink,
  X,
  Info,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

const VARIABLES = [
  "{{nomeEmpresa}}",
  "{{cidade}}",
  "{{estado}}",
  "{{telefone}}",
  "{{email}}",
  "{{cnae}}",
];

type ApprovalStatus = "approved" | "pending" | "rejected" | "unknown";

const APPROVAL_META: Record<
  ApprovalStatus,
  { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }
> = {
  approved: {
    label: "Aprovado",
    cls: "bg-green-500/15 text-green-600 border-0",
    icon: CheckCircle2,
  },
  pending: {
    label: "Em análise",
    cls: "bg-yellow-500/15 text-yellow-700 border-0",
    icon: Clock,
  },
  rejected: {
    label: "Rejeitado",
    cls: "bg-destructive/15 text-destructive border-0",
    icon: XCircle,
  },
  unknown: {
    label: "Desconhecido",
    cls: "bg-muted text-muted-foreground border-0",
    icon: Info,
  },
};

export default function Templates() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<DispatchChannel>("whatsapp");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isHsm, setIsHsm] = useState(false);
  const [contentSid, setContentSid] = useState("");
  const [variableKeys, setVariableKeys] = useState<string[]>([]);
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>("unknown");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("message_templates")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Erro ao carregar templates.");
      setLoading(false);
      return;
    }
    setTemplates((data as MessageTemplate[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setName("");
    setChannel("whatsapp");
    setSubject("");
    setBody("");
    setIsHsm(false);
    setContentSid("");
    setVariableKeys([]);
    setApprovalStatus("unknown");
  };

  const openNew = () => {
    setEditing(null);
    resetForm();
    setEditorOpen(true);
  };

  const openEdit = (tpl: MessageTemplate) => {
    setEditing(tpl);
    setName(tpl.name);
    setChannel(tpl.channel);
    setSubject(tpl.subject ?? "");
    setBody(tpl.body ?? "");
    setIsHsm(!!tpl.is_hsm);
    setContentSid(tpl.content_sid ?? "");
    setVariableKeys(tpl.variable_keys ?? []);
    setApprovalStatus((tpl.approval_status ?? "unknown") as ApprovalStatus);
    setEditorOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Nome é obrigatório.");
      return;
    }
    if (isHsm) {
      if (channel !== "whatsapp") {
        toast.error("Templates HSM só funcionam no canal WhatsApp.");
        return;
      }
      if (!contentSid.trim().startsWith("HX")) {
        toast.error('Content SID deve começar com "HX" (copie do Twilio Content Editor).');
        return;
      }
      if (!body.trim()) {
        toast.error("Preencha o preview do template (texto que será exibido no app).");
        return;
      }
    } else {
      if (!body.trim()) {
        toast.error("Mensagem é obrigatória.");
        return;
      }
      if (channel === "email" && !subject.trim()) {
        toast.error("Assunto é obrigatório para email.");
        return;
      }
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        channel,
        subject: channel === "email" ? subject.trim() : null,
        body: body.trim(),
        is_hsm: isHsm,
        content_sid: isHsm ? contentSid.trim() : null,
        variable_keys: isHsm && variableKeys.length > 0 ? variableKeys : null,
        approval_status: isHsm ? approvalStatus : "unknown",
      };
      if (editing) {
        const { error } = await (supabase as any)
          .from("message_templates")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Template atualizado.");
      } else {
        const { error } = await (supabase as any)
          .from("message_templates")
          .insert(payload);
        if (error) throw error;
        toast.success("Template criado.");
      }
      setEditorOpen(false);
      await load();
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao salvar template.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    const { error } = await (supabase as any)
      .from("message_templates")
      .delete()
      .eq("id", deletingId);
    if (error) {
      toast.error("Erro ao deletar template.");
      return;
    }
    toast.success("Template removido.");
    setDeletingId(null);
    await load();
  };

  const addVariableKey = () => {
    setVariableKeys((prev) => [...prev, AVAILABLE_VARIABLE_KEYS[0]]);
  };

  const updateVariableKey = (index: number, key: string) => {
    setVariableKeys((prev) => prev.map((v, i) => (i === index ? key : v)));
  };

  const removeVariableKey = (index: number) => {
    setVariableKeys((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-lg">Templates de mensagem</h2>
          <p className="text-sm text-muted-foreground">
            Templates freeform para mensagens normais e HSM aprovados pelo Meta para
            iniciar conversas no WhatsApp fora da janela de 24h.
          </p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo template
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Preview</TableHead>
              <TableHead>Atualizado</TableHead>
              <TableHead className="w-32 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  Carregando templates...
                </TableCell>
              </TableRow>
            )}
            {!loading && templates.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  Nenhum template cadastrado. Clique em "Novo template" para começar.
                </TableCell>
              </TableRow>
            )}
            {templates.map((tpl) => {
              const approvalMeta =
                APPROVAL_META[(tpl.approval_status ?? "unknown") as ApprovalStatus];
              const ApprovalIcon = approvalMeta.icon;
              return (
                <TableRow key={tpl.id}>
                  <TableCell className="font-medium">{tpl.name}</TableCell>
                  <TableCell>
                    {tpl.is_hsm ? (
                      <Badge className="gap-1 border-0 bg-primary/15 text-primary">
                        <Shield className="h-3 w-3" />
                        HSM
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        Freeform
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="gap-1">
                      {tpl.channel === "whatsapp" ? (
                        <MessageCircle className="h-3 w-3" />
                      ) : (
                        <Mail className="h-3 w-3" />
                      )}
                      {tpl.channel}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {tpl.is_hsm && (
                      <Badge className={`gap-1 ${approvalMeta.cls}`}>
                        <ApprovalIcon className="h-3 w-3" />
                        {approvalMeta.label}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-md">
                    <div className="truncate">
                      {tpl.subject && (
                        <span className="font-medium text-foreground">
                          {tpl.subject} —{" "}
                        </span>
                      )}
                      {tpl.body}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(tpl.updated_at).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEdit(tpl)}
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeletingId(tpl.id)}
                      title="Deletar"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Editor dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar template" : "Novo template"}
            </DialogTitle>
            <DialogDescription>
              Use variáveis como {"{{nomeEmpresa}}"} para personalizar cada disparo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Tipo: Freeform vs HSM */}
            <div className="rounded-lg border p-3 bg-muted/20 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <Label className="text-sm font-medium">Template HSM (WhatsApp)</Label>
                </div>
                <Switch
                  checked={isHsm}
                  onCheckedChange={(v) => {
                    setIsHsm(v);
                    if (v) setChannel("whatsapp");
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {isHsm
                  ? "Template aprovado pelo Meta. Pode iniciar conversa fora da janela 24h."
                  : "Mensagem livre. Só funciona dentro da janela 24h após o lead responder."}
              </p>
              {isHsm && (
                <a
                  href="https://console.twilio.com/us1/develop/sms/content-editor"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Criar template no Twilio Content Editor
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            {/* Canal */}
            <div className="space-y-1.5">
              <Label className="text-xs">Canal</Label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={channel === "whatsapp" ? "default" : "outline"}
                  onClick={() => setChannel("whatsapp")}
                  type="button"
                >
                  WhatsApp
                </Button>
                <Button
                  size="sm"
                  variant={channel === "email" ? "default" : "outline"}
                  onClick={() => setChannel("email")}
                  disabled={isHsm}
                  type="button"
                >
                  Email
                </Button>
              </div>
              {isHsm && (
                <p className="text-xs text-muted-foreground">
                  HSM só está disponível para WhatsApp.
                </p>
              )}
            </div>

            {/* Nome */}
            <div className="space-y-1.5">
              <Label className="text-xs">Nome do template</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Apresentação clínica"
              />
            </div>

            {/* Campos HSM-only */}
            {isHsm && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1">
                    Content SID
                    <span className="text-muted-foreground">(do Twilio)</span>
                  </Label>
                  <Input
                    value={contentSid}
                    onChange={(e) => setContentSid(e.target.value)}
                    placeholder="HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="font-mono-data text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Copie do Twilio Console → Messaging → Content Editor.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Status de aprovação (Meta)
                  </Label>
                  <Select
                    value={approvalStatus}
                    onValueChange={(v) => setApprovalStatus(v as ApprovalStatus)}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unknown">Desconhecido</SelectItem>
                      <SelectItem value="pending">Em análise</SelectItem>
                      <SelectItem value="approved">Aprovado</SelectItem>
                      <SelectItem value="rejected">Rejeitado</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Atualize manualmente conforme o Meta processar a aprovação.
                  </p>
                </div>

                <div className="space-y-2 rounded-lg border p-3 bg-muted/10">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">
                      Variáveis do template
                    </Label>
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={addVariableKey}
                      className="h-7 gap-1 text-xs"
                    >
                      <Plus className="h-3 w-3" />
                      Adicionar
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Mapeie cada {"{{1}}"}, {"{{2}}"}... do template Twilio para um
                    campo do lead.
                  </p>

                  {variableKeys.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic py-2">
                      Nenhuma variável. Adicione se o template tiver placeholders.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {variableKeys.map((key, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <span className="text-xs font-mono-data text-muted-foreground w-8">
                            {`{{${index + 1}}}`}
                          </span>
                          <Select
                            value={key}
                            onValueChange={(v) => updateVariableKey(index, v)}
                          >
                            <SelectTrigger className="h-8 text-xs flex-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {AVAILABLE_VARIABLE_KEYS.map((k) => (
                                <SelectItem key={k} value={k}>
                                  {k}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="icon"
                            variant="ghost"
                            type="button"
                            onClick={() => removeVariableKey(index)}
                            className="h-7 w-7 shrink-0"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Email subject */}
            {channel === "email" && !isHsm && (
              <div className="space-y-1.5">
                <Label className="text-xs">Assunto</Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ex: Proposta para {{nomeEmpresa}}"
                />
              </div>
            )}

            {/* Body / Preview */}
            <div className="space-y-1.5">
              <Label className="text-xs">
                {isHsm ? "Preview do template (apenas exibição)" : "Mensagem"}
              </Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={
                  isHsm
                    ? "Olá {{nomeEmpresa}}, somos a RadiFlex... (texto que aparece no app)"
                    : "Olá {{nomeEmpresa}}, somos a RadiFlex..."
                }
                rows={isHsm ? 4 : 6}
              />
              {isHsm && (
                <p className="text-xs text-muted-foreground">
                  Este texto é só para preview interno. O Twilio envia o template
                  aprovado pelo Meta usando o Content SID.
                </p>
              )}
              <div className="flex flex-wrap gap-1 pt-1">
                {VARIABLES.map((v) => (
                  <Badge
                    key={v}
                    variant="secondary"
                    className="cursor-pointer text-xs hover:bg-primary hover:text-primary-foreground transition-colors"
                    onClick={() => setBody((b) => b + v)}
                  >
                    {v}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditorOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover template?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Disparos anteriores que usaram este template
              continuarão visíveis no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
