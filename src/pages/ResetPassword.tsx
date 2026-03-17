// src/pages/ResetPassword.tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AuthCard } from "@/components/AuthCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const ResetPassword = () => {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    });
    setLoading(false);
    setSent(true); // always show success to avoid email enumeration
  };

  return (
    <AuthCard>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-gray-900">Recuperar senha</h1>
        <p className="text-sm text-gray-500">
          Enviaremos um link para redefinir sua senha.
        </p>
      </div>

      {sent ? (
        <div className="space-y-4">
          <p className="text-sm text-green-600 bg-green-50 rounded-lg p-3">
            Se esse e-mail estiver cadastrado, você receberá o link em instantes.
          </p>
          <Link to="/login" className="block text-center text-sm text-primary hover:underline">
            Voltar ao login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading || sent}>
            {loading ? "Enviando..." : "Enviar link"}
          </Button>

          <p className="text-center text-sm text-gray-500">
            <Link to="/login" className="text-primary hover:underline">
              Voltar ao login
            </Link>
          </p>
        </form>
      )}
    </AuthCard>
  );
};

export default ResetPassword;
