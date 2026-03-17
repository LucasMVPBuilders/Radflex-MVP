// src/components/ProtectedRoute.tsx
import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export const ProtectedRoute = () => {
  // null = still checking, true = authenticated, false = not authenticated
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    // getSession() as a fast hint to avoid spinner on valid cached sessions
    supabase.auth.getSession().then(({ data }) => {
      if (authed === null) setAuthed(!!data.session);
    });

    // onAuthStateChange is the authoritative source — server-validated
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (authed === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return authed ? <Outlet /> : <Navigate to="/login" replace />;
};
