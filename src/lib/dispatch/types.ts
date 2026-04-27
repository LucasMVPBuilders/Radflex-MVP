import { Lead } from "@/data/types";

export type DispatchChannel = "whatsapp" | "email";

// UI-only states ('sending') are never written to dispatch_logs.
export type DispatchStatus =
  | "pending"
  | "sending"
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "replied"
  | "failed"
  | "undelivered"
  | "cancelled";

// Statuses that may be written to dispatch_logs (everything except 'sending').
export type PersistedDispatchStatus = Exclude<DispatchStatus, "sending">;

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
  // HSM (WhatsApp pre-approved template) fields
  is_hsm?: boolean;
  content_sid?: string | null;
  variable_keys?: string[] | null;
  approval_status?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadSnapshot {
  companyName: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  cnae: string;
}

// Temporary shim — replace with generated Supabase type after applying migration
// and running: supabase gen types typescript --project-id <id>
export interface DispatchLogInsert {
  template_id: string | null;
  lead_id: string; // format: "saved:{uuid}" or "session:{placeId}"
  lead_snapshot: LeadSnapshot;
  channel: DispatchChannel;
  status: "sent" | "failed" | "cancelled" | "queued";
  error_msg?: string;
  sent_at?: string;
  contact_value?: string | null;
  provider_message_id?: string | null;
  provider_status?: string | null;
}

// Row shape returned when reading dispatch_logs (subset of all columns).
export interface DispatchLogRow {
  id: string;
  template_id: string | null;
  lead_id: string;
  lead_snapshot: LeadSnapshot | null;
  channel: DispatchChannel;
  status: PersistedDispatchStatus;
  error_msg: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  replied_at: string | null;
  provider_message_id: string | null;
  provider_status: string | null;
  contact_value: string | null;
  created_at: string;
  updated_at: string | null;
  // Joined template name (resolved client-side or via select with FK alias)
  template_name?: string | null;
}
