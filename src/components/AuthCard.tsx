// src/components/AuthCard.tsx
import { ReactNode } from "react";

interface AuthCardProps {
  children: ReactNode;
}

export const AuthCard = ({ children }: AuthCardProps) => (
  <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1A1A2E] to-[#2D1B6B] p-4">
    <div className="w-full max-w-[420px] bg-white rounded-xl shadow-lg p-8 space-y-6">
      {/* Logo */}
      <div className="flex justify-center">
        <span
          className="px-3 py-1.5 rounded-lg text-white text-lg tracking-tight"
          style={{ background: "#5B2ECC", fontFamily: "Sora, sans-serif", fontWeight: 800 }}
        >
          ⌘ radflex.
        </span>
      </div>
      {children}
    </div>
  </div>
);
