// src/pages/UpdatePassword.tsx
import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AuthCard } from "@/components/AuthCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type PageState = "loading" | "ready" | "invalid" | "success";

const UpdatePassword = () => {
  const navigate = useNavigate();
  const [pageState, setPageState] = useState<PageState>("loading");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const recoveredRef = useRef(false);

  useEffect(() => {
    // Register listener synchronously before any async call
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        recoveredRef.current = true;
        setPageState("ready");
      }
    });

    // Fallback: event may have already fired before component mounted
    supabase.auth.getSession().then(({ data }) => {
      if (!recoveredRef.current) {
        setPageState(data.session ? "ready" : "invalid");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    if (password.length < 6) {
      setError("A senha deve ter ao menos 6 caracteres.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      navigate("/", { replace: true });
    }
  };

  if (pageState === "loading") {
    return (
      <AuthCard>
        <p className="text-center text-sm text-gray-500">Verificando link...</p>
      </AuthCard>
    );
  }

  if (pageState === "invalid") {
    return (
      <AuthCard>
        <p className="text-sm text-red-500 bg-red-50 rounded-lg p-3">
          Link expirado ou inválido.
        </p>
        <Link to="/reset-password" className="block text-center text-sm text-primary hover:underline">
          Solicitar novo link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-gray-900">Nova senha</h1>
        <p className="text-sm text-gray-500">Escolha uma senha segura.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">Nova senha</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirmar senha</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Salvando..." : "Salvar senha"}
        </Button>
      </form>
    </AuthCard>
  );
};

export default UpdatePassword;
