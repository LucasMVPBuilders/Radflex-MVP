import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Lead } from "@/data/types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const BR_STATES = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS",
  "MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

interface LeadFormPanelProps {
  /** null = criar novo | Lead = editar existente */
  lead: Lead | null;
  onClose: () => void;
  onSaved: (lead: Lead) => void;
  onDeleted: (id: string) => void;
}

interface FormState {
  companyName: string;
  cnae: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  website: string;
  address: string;
  cnpj: string;
}

const empty: FormState = {
  companyName: "",
  cnae: "",
  phone: "",
  email: "",
  city: "",
  state: "",
  website: "",
  address: "",
  cnpj: "",
};

function leadToForm(lead: Lead): FormState {
  return {
    companyName: lead.companyName,
    cnae: lead.cnae,
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    city: lead.city ?? "",
    state: lead.state ?? "",
    website: lead.website ?? "",
    address: lead.address ?? "",
    cnpj: lead.cnpj ?? "",
  };
}

export function LeadFormPanel({ lead, onClose, onSaved, onDeleted }: LeadFormPanelProps) {
  const isEdit = lead !== null;

  const [form, setForm] = useState<FormState>(lead ? leadToForm(lead) : empty);
  const [saving, setSaving] = useState(false);

  // Reset form when lead changes (open new vs edit different lead)
  useEffect(() => {
    setForm(lead ? leadToForm(lead) : empty);
  }, [lead]);

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSave = async () => {
    if (!form.companyName.trim()) {
      toast.error("Nome da empresa é obrigatório.");
      return;
    }
    setSaving(true);
    try {
      const raw = {
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        city: form.city.trim() || null,
        website: form.website.trim() || null,
        address: form.address.trim() || null,
        cnpj: form.cnpj.trim() || null,
      };

      if (isEdit && lead) {
        const { data, error } = await supabase
          .from("leads")
          .update({
            company_name: form.companyName.trim(),
            cnae_code: form.cnae.trim() || null,
            uf: form.state || null,
            raw,
          })
          .eq("id", lead.id)
          .select()
          .single();

        if (error) throw error;

        const updated: Lead = {
          ...lead,
          companyName: form.companyName.trim(),
          cnae: form.cnae.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          city: form.city.trim(),
          state: form.state,
          website: form.website.trim() || undefined,
          address: form.address.trim() || undefined,
          cnpj: form.cnpj.trim() || lead.id,
        };
        toast.success("Lead atualizado.");
        onSaved(updated);
      } else {
        const { data, error } = await supabase
          .from("leads")
          .insert({
            company_name: form.companyName.trim(),
            cnae_code: form.cnae.trim() || null,
            uf: form.state || null,
            status: "new",
            faturamento_est: 0,
            raw,
          })
          .select()
          .single();

        if (error) throw error;

        const created: Lead = {
          id: (data as any).id,
          companyName: form.companyName.trim(),
          cnae: form.cnae.trim(),
          estimatedRevenue: 0,
          city: form.city.trim(),
          state: form.state,
          phone: form.phone.trim(),
          email: form.email.trim(),
          status: "new",
          cnpj: form.cnpj.trim() || (data as any).id,
          website: form.website.trim() || undefined,
          address: form.address.trim() || undefined,
        };
        toast.success("Lead criado.");
        onSaved(created);
      }
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao salvar lead.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!lead) return;
    const { error } = await supabase.from("leads").delete().eq("id", lead.id);
    if (error) {
      toast.error("Erro ao excluir lead.");
      return;
    }
    toast.success("Lead excluído.");
    onDeleted(lead.id);
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-foreground/20 z-40"
        onClick={onClose}
      />
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="fixed right-0 top-0 h-screen w-96 bg-card border-l border-border z-50 shadow-xl overflow-y-auto"
      >
            {/* Header */}
            <div className="px-6 py-5 border-b border-border flex items-center justify-between">
              <h2 className="font-semibold text-lg text-foreground">
                {isEdit ? "Editar Lead" : "Novo Lead Manual"}
              </h2>
              <button
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <div className="px-6 py-5 space-y-4">
              <Field label="Nome da empresa *">
                <Input value={form.companyName} onChange={set("companyName")} placeholder="Ex: Clínica Previmagem" />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="CNAE">
                  <Input value={form.cnae} onChange={set("cnae")} placeholder="Ex: 8640-2/05" />
                </Field>
                <Field label="UF">
                  <Select value={form.state} onValueChange={(v) => setForm((p) => ({ ...p, state: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                      {BR_STATES.map((uf) => (
                        <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Field label="Cidade">
                <Input value={form.city} onChange={set("city")} placeholder="Ex: Brasília" />
              </Field>

              <Field label="Telefone">
                <Input value={form.phone} onChange={set("phone")} placeholder="Ex: (61) 99999-9999" />
              </Field>

              <Field label="Email">
                <Input value={form.email} onChange={set("email")} type="email" placeholder="contato@clinica.com.br" />
              </Field>

              <Field label="Site">
                <Input value={form.website} onChange={set("website")} placeholder="https://clinica.com.br" />
              </Field>

              <Field label="Endereço">
                <Input value={form.address} onChange={set("address")} placeholder="Rua, número, bairro" />
              </Field>

              <Field label="CNPJ">
                <Input value={form.cnpj} onChange={set("cnpj")} placeholder="00.000.000/0001-00" />
              </Field>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2">
                <Button className="flex-1" onClick={handleSave} disabled={saving}>
                  {saving ? "Salvando..." : isEdit ? "Salvar alterações" : "Criar lead"}
                </Button>

                {isEdit && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir lead?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação não pode ser desfeita. O lead <strong>{lead?.companyName}</strong> será removido permanentemente.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDelete}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
      </motion.div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground uppercase tracking-wider">{label}</Label>
      {children}
    </div>
  );
}
