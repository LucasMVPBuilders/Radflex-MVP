import { Lead } from "@/data/types";

export type DispatchChannel = "whatsapp" | "email";

// 'sending' is UI-only — NEVER written to dispatch_logs
export type DispatchStatus =
  | "pending"
  | "sending"
  | "sent"
  | "failed"
  | "cancelled";

export interface DispatchItem {
  lead: Lead;
  status: DispatchStatus;
  error?: string;
}

export interface MessageTemplate {
  id: string;
  name: string;
  channel: DispatchChannel;
  subject?: string;
  body: string;
  created_at: string;
  updated_at: string;
}

// Temporary shim — replace with generated Supabase type after applying migration
// and running: supabase gen types typescript --project-id <id>
export interface DispatchLogInsert {
  template_id: string | null;
  lead_id: string; // format: "saved:{uuid}" or "session:{placeId}"
  lead_snapshot: {
    companyName: string;
    phone: string;
    email: string;
    city: string;
    state: string;
    cnae: string;
  };
  channel: DispatchChannel;
  status: "sent" | "failed" | "cancelled";
  error_msg?: string;
  sent_at?: string; // ISO string, set by frontend
}
