import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchAppSettings,
  saveAppSettings,
  testIntegration,
  IntegrationTestResult,
} from "@/lib/api/appSettings";
import { toast } from "sonner";
import {
  Settings as SettingsIcon,
  MessageCircle,
  Mail,
  CheckCircle2,
  XCircle,
  Lock,
  ExternalLink,
  Loader2,
} from "lucide-react";

interface FormState {
  twilioWhatsappFrom: string;
  twilioSmsFrom: string;
  sendgridFromEmail: string;
}

const EMPTY_FORM: FormState = {
  twilioWhatsappFrom: "",
  twilioSmsFrom: "",
  sendgridFromEmail: "",
};

export default function Configuracoes() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [initial, setInitial] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const [testingTwilio, setTestingTwilio] = useState(false);
  const [testingSendgrid, setTestingSendgrid] = useState(false);
  const [twilioResult, setTwilioResult] = useState<IntegrationTestResult | null>(null);
  const [sendgridResult, setSendgridResult] = useState<IntegrationTestResult | null>(null);

  const [secretHelpOpen, setSecretHelpOpen] = useState<null | "twilio" | "sendgrid">(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchAppSettings();
      const next: FormState = {
        twilioWhatsappFrom: data.twilioWhatsappFrom ?? "",
        twilioSmsFrom: data.twilioSmsFrom ?? "",
        sendgridFromEmail: data.sendgridFromEmail ?? "",
      };
      setForm(next);
      setInitial(next);
      setUpdatedAt(data.updatedAt);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao carregar configurações.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const dirty =
    form.twilioWhatsappFrom !== initial.twilioWhatsappFrom ||
    form.twilioSmsFrom !== initial.twilioSmsFrom ||
    form.sendgridFromEmail !== initial.sendgridFromEmail;

  const save = async () => {
    setSaving(true);
    try {
      await saveAppSettings({
        twilioWhatsappFrom: form.twilioWhatsappFrom,
        twilioSmsFrom: form.twilioSmsFrom,
        sendgridFromEmail: form.sendgridFromEmail,
      });
      toast.success("Configurações salvas.");
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const runTwilioTest = async () => {
    setTestingTwilio(true);
    setTwilioResult(null);
    try {
      const r = await testIntegration("twilio");
      setTwilioResult(r);
      if (r.ok) toast.success(r.detail ?? "Twilio respondeu.");
      else toast.error(r.error ?? "Falha no Twilio.");
    } finally {
      setTestingTwilio(false);
    }
  };

  const runSendgridTest = async () => {
    setTestingSendgrid(true);
    setSendgridResult(null);
    try {
      const r = await testIntegration("sendgrid");
      setSendgridResult(r);
      if (r.ok) toast.success(r.detail ?? "SendGrid respondeu.");
      else toast.error(r.error ?? "Falha no SendGrid.");
    } finally {
      setTestingSendgrid(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="ml-64 p-6 space-y-6 max-w-4xl">
        <header>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <SettingsIcon className="h-6 w-6 text-primary" />
            Configurações
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure os números de envio do Twilio e o email remetente do SendGrid.
            Tokens secretos continuam armazenados nos Secrets do Supabase.
          </p>
          {updatedAt && (
            <p className="text-xs text-muted-foreground mt-1">
              Última atualização: {new Date(updatedAt).toLocaleString("pt-BR")}
            </p>
          )}
        </header>

        {loading ? (
          <div className="rounded-lg border p-8 text-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
            Carregando configurações...
          </div>
        ) : (
          <>
            {/* TWILIO */}
            <section className="rounded-lg border p-6 space-y-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <MessageCircle className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-lg">Twilio</h2>
                    <p className="text-sm text-muted-foreground">
                      WhatsApp e SMS via Twilio Programmable Messaging.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={runTwilioTest}
                  disabled={testingTwilio}
                >
                  {testingTwilio ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : null}
                  Testar conexão
                </Button>
              </div>

              {twilioResult && <TestResultBanner result={twilioResult} />}

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="wa-from" className="text-xs">
                    WhatsApp From
                  </Label>
                  <Input
                    id="wa-from"
                    placeholder="+14155238886 ou whatsapp:+14155238886"
                    value={form.twilioWhatsappFrom}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, twilioWhatsappFrom: e.target.value }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Número aprovado para WhatsApp na sua conta Twilio.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sms-from" className="text-xs">
                    SMS From
                  </Label>
                  <Input
                    id="sms-from"
                    placeholder="+15005550006"
                    value={form.twilioSmsFrom}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, twilioSmsFrom: e.target.value }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Número Twilio para SMS (opcional se você não usa SMS).
                  </p>
                </div>
              </div>

              <SecretRow
                label="Account SID + Auth Token"
                helpKey="twilio"
                onOpen={() => setSecretHelpOpen("twilio")}
              />
            </section>

            {/* SENDGRID */}
            <section className="rounded-lg border p-6 space-y-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-lg">SendGrid</h2>
                    <p className="text-sm text-muted-foreground">
                      Disparos por email via SendGrid Mail API.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={runSendgridTest}
                  disabled={testingSendgrid}
                >
                  {testingSendgrid ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : null}
                  Testar conexão
                </Button>
              </div>

              {sendgridResult && <TestResultBanner result={sendgridResult} />}

              <div className="space-y-1.5">
                <Label htmlFor="sg-from" className="text-xs">
                  Email remetente
                </Label>
                <Input
                  id="sg-from"
                  type="email"
                  placeholder="contato@seudominio.com"
                  value={form.sendgridFromEmail}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, sendgridFromEmail: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Email verificado no SendGrid. Disparos saem com esse remetente.
                </p>
              </div>

              <SecretRow
                label="API Key"
                helpKey="sendgrid"
                onOpen={() => setSecretHelpOpen("sendgrid")}
              />
            </section>

            {/* SAVE */}
            <div className="flex items-center justify-end gap-2 sticky bottom-4 bg-background/80 backdrop-blur-sm rounded-lg border p-3">
              {dirty && (
                <span className="text-xs text-warning-muted-foreground mr-auto">
                  Você tem alterações não salvas.
                </span>
              )}
              <Button
                variant="ghost"
                onClick={() => setForm(initial)}
                disabled={!dirty || saving}
              >
                Descartar
              </Button>
              <Button onClick={save} disabled={!dirty || saving}>
                {saving ? "Salvando..." : "Salvar configurações"}
              </Button>
            </div>
          </>
        )}
      </main>

      <Dialog open={!!secretHelpOpen} onOpenChange={(o) => !o && setSecretHelpOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Como atualizar tokens secretos
            </DialogTitle>
            <DialogDescription>
              Por segurança, tokens secretos não ficam no banco — só nos Supabase Secrets.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <p>
              <strong>1.</strong> Vá em{" "}
              <a
                className="text-primary inline-flex items-center gap-1 hover:underline"
                target="_blank"
                rel="noreferrer"
                href="https://supabase.com/dashboard/project/cxrhpfywlbtcsrgxydhn/settings/functions"
              >
                Supabase Dashboard → Edge Functions → Secrets
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
            <p>
              <strong>2.</strong> Localize ou crie o secret:
            </p>
            {secretHelpOpen === "twilio" ? (
              <ul className="list-disc pl-5 space-y-1 text-xs font-mono">
                <li>
                  <code className="bg-muted px-1.5 py-0.5 rounded">TWILIO_ACCOUNT_SID</code>{" "}
                  — começa com <code>AC...</code>
                </li>
                <li>
                  <code className="bg-muted px-1.5 py-0.5 rounded">TWILIO_AUTH_TOKEN</code>{" "}
                  — string de 32 caracteres
                </li>
              </ul>
            ) : (
              <ul className="list-disc pl-5 space-y-1 text-xs font-mono">
                <li>
                  <code className="bg-muted px-1.5 py-0.5 rounded">SENDGRID_API_KEY</code>{" "}
                  — começa com <code>SG.</code>
                </li>
              </ul>
            )}
            <p>
              <strong>3.</strong> Cole o valor e salve. As Edge Functions pegam o novo
              valor na próxima invocação (sem redeploy).
            </p>
            <p>
              <strong>4.</strong> Volte aqui e clique em <strong>Testar conexão</strong>{" "}
              pra validar.
            </p>
          </div>

          <DialogFooter>
            <Button onClick={() => setSecretHelpOpen(null)}>Entendi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TestResultBanner({ result }: { result: IntegrationTestResult }) {
  if (result.ok) {
    return (
      <div className="flex items-start gap-2 rounded-md bg-green-500/10 border border-green-500/30 px-3 py-2 text-sm text-green-700">
        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
        <span>{result.detail ?? "Conexão OK."}</span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
      <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
      <span>{result.error ?? "Erro desconhecido."}</span>
    </div>
  );
}

function SecretRow({
  label,
  onOpen,
}: {
  label: string;
  helpKey: "twilio" | "sendgrid";
  onOpen: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-medium">{label}</span>
        <Badge variant="secondary" className="ml-1">
          Supabase Secrets
        </Badge>
      </div>
      <Button size="sm" variant="ghost" onClick={onOpen} className="text-xs">
        Como atualizar?
      </Button>
    </div>
  );
}
