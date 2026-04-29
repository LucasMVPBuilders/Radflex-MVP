// src/components/AuthCard.tsx
import { ReactNode } from "react";
import { RadFlexLogo } from "@/components/RadFlexLogo";

interface AuthCardProps {
  children: ReactNode;
}

export const AuthCard = ({ children }: AuthCardProps) => (
  <div className="min-h-screen flex items-center justify-center gradient-dark p-4">
    <div className="w-full max-w-[420px] bg-white rounded-xl shadow-lg p-8 space-y-6">
      <div className="flex justify-center">
        <RadFlexLogo variant="light" className="h-9 w-auto" />
      </div>
      {children}
    </div>
  </div>
);
