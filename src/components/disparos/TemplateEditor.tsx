import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Shield, CheckCircle2, Clock, XCircle, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MessageTemplate, DispatchChannel } from "@/lib/dispatch/types";
import { interpolate } from "@/lib/dispatch/utils";
import { Lead } from "@/data/types";
import { toast } from "sonner";

const VARIABLES = [
  "{{nomeEmpresa}}",
  "{{cidade}}",
  "{{estado}}",
  "{{telefone}}",
  "{{email}}",
  "{{cnae}}",
];

interface TemplateEditorProps {
  channel: DispatchChannel;
  onChannelChange: (c: DispatchChannel) => void;
  selectedTemplate: MessageTemplate | null;
  onTemplateChange: (t: MessageTemplate | null) => void;
  previewLead: Lead | null;
}

export function TemplateEditor({
  channel,
  onChannelChange,
  selectedTemplate,
  onTemplateChange,
  previewLead,
}: TemplateEditorProps) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [isNew, setIsNew] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const loadTemplates = async () => {
    const { data } = await (supabase as any)
      .from("message_templates")
      .select("*")
      .eq("channel", channel)
      .order("created_at", { ascending: false });
    setTemplates((data as MessageTemplate[]) ?? []);
  };

  useEffect(() => {
    loadTemplates();
    onTemplateChange(null);
    setIsNew(false);
    setName("");
    setSubject("");
    setBody("");
  }, [channel]);

  const handleSelect = (id: string) => {
    const tpl = templates.find((t) => t.id === id) ?? null;
    onTemplateChange(tpl);
    if (tpl) {
      setName(tpl.name);
      setSubject(tpl.subject ?? "");
      setBody(tpl.body);
      setIsNew(false);
    }
  };

  const handleNew = () => {
    setIsNew(true);
    onTemplateChange(null);
    setName("");
    setSubject("");
    setBody("");
  };

  const handleSave = async () => {
    if (!name.trim() || !body.trim()) {
      toast.error("Nome e corpo são obrigatórios.");
      return;
    }
    if (channel === "email" && !subject.trim()) {
      toast.error("Assunto é obrigatório para templates de email.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        channel,
        subject: channel === "email" ? subject.trim() : null,
        body: body.trim(),
      };
      const { data, error } = await (supabase as any)
        .from("message_templates")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      toast.success("Template salvo.");
      await loadTemplates();
      onTemplateChange(data as MessageTemplate);
      setIsNew(false);
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao salvar template.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTemplate) return;
    const { error } = await (supabase as any)
      .from("message_templates")
      .delete()
      .eq("id", selectedTemplate.id);
    if (error) {
      toast.error("Erro ao deletar template.");
      return;
    }
    toast.success("Template removido.");
    onTemplateChange(null);
    setName("");
    setSubject("");
    setBody("");
    await loadTemplates();
  };

  const previewBody = previewLead && body ? interpolate(body, previewLead) : body;
  const previewSubject =
    previewLead && subject ? interpolate(subject, previewLead) : subject;

  return (
    <div className="space-y-4">
      {/* Channel */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={channel === "whatsapp" ? "default" : "outline"}
          onClick={() => onChannelChange("whatsapp")}
        >
          WhatsApp
        </Button>
        <Button
          size="sm"
          variant={channel === "email" ? "default" : "outline"}
          onClick={() => onChannelChange("email")}
        >
          Email
        </Button>
      </div>

      {/* Template select */}
      <div className="flex gap-2 items-end">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Template</Label>
          <Select
            value={selectedTemplate?.id ?? ""}
            onValueChange={handleSelect}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Selecionar template..." />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="flex items-center gap-2">
                    {t.is_hsm && <Shield className="h-3 w-3 text-primary" />}
                    {t.name}
                    {t.is_hsm && (
                      <span className="text-xs text-muted-foreground">(HSM)</span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" variant="outline" onClick={handleNew}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Novo
        </Button>
        {selectedTemplate && (
          <Button size="sm" variant="ghost" onClick={handleDelete}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        )}
      </div>

      {/* HSM info banner */}
      {selectedTemplate?.is_hsm && (
        <HsmInfoBanner
          status={(selectedTemplate.approval_status ?? "unknown") as
            | "approved"
            | "pending"
            | "rejected"
            | "unknown"}
          contentSid={selectedTemplate.content_sid ?? null}
        />
      )}

      {/* Editor */}
      {(isNew || selectedTemplate) && (
        <div className="space-y-3 p-3 rounded border bg-muted/30">
          <div className="space-y-1">
            <Label className="text-xs">Nome do template</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Apresentação clínica"
              className="h-8 text-sm"
            />
          </div>
          {channel === "email" && (
            <div className="space-y-1">
              <Label className="text-xs">Assunto</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Ex: Proposta para {{nomeEmpresa}}"
                className="h-8 text-sm"
              />
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Mensagem</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Olá {{nomeEmpresa}}, somos a RadiFlex..."
              rows={4}
              className="text-sm"
            />
          </div>
          {/* Variable chips */}
          <div className="flex flex-wrap gap-1">
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
          {isNew && (
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : "Salvar template"}
            </Button>
          )}
        </div>
      )}

      {/* Preview */}
      {previewLead && body && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            Preview — {previewLead.companyName}
          </Label>
          {channel === "email" && subject && (
            <p className="text-xs font-medium">Assunto: {previewSubject}</p>
          )}
          <div className="p-3 rounded border bg-muted/20 text-sm whitespace-pre-wrap">
            {previewBody}
          </div>
        </div>
      )}
    </div>
  );
}

function HsmInfoBanner({
  status,
  contentSid,
}: {
  status: "approved" | "pending" | "rejected" | "unknown";
  contentSid: string | null;
}) {
  const config = {
    approved: {
      cls: "bg-green-500/10 border-green-500/30 text-green-700",
      icon: CheckCircle2,
      msg: "Template HSM aprovado pelo Meta — pode disparar para qualquer lead, mesmo fora da janela 24h.",
    },
    pending: {
      cls: "bg-yellow-500/10 border-yellow-500/30 text-yellow-800",
      icon: Clock,
      msg: "Template em análise pelo Meta. Aguarde aprovação antes de disparar (pode falhar).",
    },
    rejected: {
      cls: "bg-destructive/10 border-destructive/30 text-destructive",
      icon: XCircle,
      msg: "Template rejeitado pelo Meta. Disparos vão falhar — revise o template no Twilio.",
    },
    unknown: {
      cls: "bg-muted border-border text-muted-foreground",
      icon: Info,
      msg: "Status de aprovação desconhecido. Atualize manualmente em /disparos/templates.",
    },
  };
  const c = config[status];
  const Icon = c.icon;

  return (
    <div className={`flex items-start gap-2 rounded-md border p-2.5 text-xs ${c.cls}`}>
      <Shield className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-1.5 font-semibold">
          <Icon className="h-3 w-3" />
          Template HSM
        </div>
        <p>{c.msg}</p>
        {contentSid && (
          <p className="font-mono-data text-[10px] opacity-70 truncate">
            {contentSid}
          </p>
        )}
      </div>
    </div>
  );
}
