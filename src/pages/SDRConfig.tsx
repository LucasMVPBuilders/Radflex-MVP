import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { fetchLatestSdrPrompt, saveSdrPrompt } from "@/lib/api/sdr";
import { Card, CardContent } from "@/components/ui/card";
import { AppSidebar } from "@/components/AppSidebar";

const DEFAULT_PROMPT = `Voce e um SDR B2B (agente de qualificacao).

Voce deve CONVERSAR com o lead via WhatsApp: primeiro faça perguntas objetivas para entender as necessidades e se ha interesse real.
Somente quando houver informacao suficiente para decidir, marque isFinal=true.

Objetivo de qualificacao (exemplo):
- Lead tem dor clara ou interesse em RadiFlex?
- Existem sinais de capacidade/viabilidade (ex: perfil do decisor, timing, necessidade real)?
- O lead merece avancar para a proxima etapa do funil.

Regras:
1. Use os placeholders para considerar {{companyName}}, {{leadStage}} e o {{conversation}} completo.
2. Se ainda nao tiver dados suficientes, isFinal=false e responda com uma proxima pergunta em nextMessage (nao deixe nextMessage vazio).
3. Se ja tiver dados suficientes, isFinal=true, decida entre "qualified" e "desqualified".
4. nextMessage deve ser a mensagem final (ack + proximo passo) quando isFinal=true (final_with_msg). Se nao fizer sentido mandar mensagem final, retorne nextMessage=null.
5. Sempre retorne summary e reason.

Placeholders disponiveis:
- {{companyName}}
- {{leadStage}}
- {{latestInboundMessage}}
- {{conversation}}

Saida obrigatoria SOMENTE em JSON (sem texto extra):
{
  "isFinal": boolean,
  "decision": "qualified" | "desqualified", // somente quando isFinal=true
  "nextMessage": string | null,             // mensagem a enviar ao lead (pergunta/ack)
  "summary": string,                         // resumo curto do que foi falado + resultado
  "reason": string,                          // motivo objetivo da decisao (criterios)
  "confidence": number                      // opcional (0 a 1)
}`;

export default function SDRConfig() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const run = async () => {
      try {
        const latest = await fetchLatestSdrPrompt();
        if (latest) {
          setPrompt(latest.prompt ?? "");
          setIsActive(Boolean(latest.isActive));
        }
      } catch (e: any) {
        toast.error(e?.message ?? "Erro ao carregar configuracao do SDR.");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  const placeholderHint = useMemo(
    () => [
      "{{companyName}}",
      "{{leadStage}}",
      "{{latestInboundMessage}}",
      "{{conversation}}",
    ],
    []
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSdrPrompt({ prompt, isActive });
      toast.success("Prompt do SDR salvo.");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar prompt do SDR.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Carregando SDR...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="ml-64 space-y-6 p-6">
        <h1 className="text-2xl font-bold">Configurar SDR</h1>
        <p className="text-sm text-muted-foreground">
          Edite o prompt dinamico usado para qualificar leads quando eles responderem.
        </p>

        <Card className="rounded-2xl">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label>SDR ativo</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Quando ativo, a cada resposta inbound o SDR roda e qualifica/desqualifica.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {isActive ? "Ativo" : "Inativo"}
                </span>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Prompt</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[420px] font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Placeholders disponiveis: {placeholderHint.join(", ")}
              </p>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => void handleSave()} disabled={saving}>
                {saving ? "Salvando..." : "Salvar prompt"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

