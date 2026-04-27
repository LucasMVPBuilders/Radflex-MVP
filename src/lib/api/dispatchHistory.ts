import { supabase } from "@/integrations/supabase/client";
import {
  DispatchChannel,
  DispatchLogRow,
  PersistedDispatchStatus,
} from "@/lib/dispatch/types";

const DEFAULT_DEDUP_DAYS = 30;

export interface DispatchHistoryFilters {
  channel?: DispatchChannel | "all";
  status?: PersistedDispatchStatus | "all";
  templateId?: string | "all";
  search?: string;
  fromDate?: string; // ISO
  toDate?: string;   // ISO
  limit?: number;
}

export interface DispatchStats {
  total: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  failed: number;
  cancelled: number;
  deliveryRate: number;
  readRate: number;
  replyRate: number;
}

/**
 * Returns the set of contact values (normalized phone/email) that received
 * a successful dispatch in the given window. Used to warn before re-sending.
 */
export async function checkRecentlyDispatched(
  contacts: string[],
  channel: DispatchChannel,
  days: number = DEFAULT_DEDUP_DAYS,
): Promise<Set<string>> {
  const filtered = contacts.filter((c) => !!c);
  if (filtered.length === 0) return new Set();

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await (supabase as any)
    .from("dispatch_logs")
    .select("contact_value")
    .eq("channel", channel)
    .in("status", ["sent", "delivered", "read", "replied"])
    .gte("sent_at", since)
    .in("contact_value", filtered);

  if (error) {
    console.error("checkRecentlyDispatched error:", error);
    return new Set();
  }

  return new Set(
    ((data ?? []) as Array<{ contact_value: string | null }>)
      .map((r) => r.contact_value)
      .filter((v): v is string => !!v),
  );
}

/**
 * Returns ALL contact values that have any dispatch_log row, regardless of
 * channel or recency. Used to populate the "ever dispatched" filter on the
 * lead selector — cheap because we only select contact_value.
 */
export async function fetchAllDispatchedContacts(): Promise<{
  byChannel: Record<DispatchChannel, Set<string>>;
  any: Set<string>;
}> {
  const { data, error } = await (supabase as any)
    .from("dispatch_logs")
    .select("contact_value, channel, status")
    .not("contact_value", "is", null);

  const empty = {
    byChannel: { whatsapp: new Set<string>(), email: new Set<string>() },
    any: new Set<string>(),
  };

  if (error) {
    console.error("fetchAllDispatchedContacts error:", error);
    return empty;
  }

  const result = empty;
  for (const row of (data ?? []) as Array<{
    contact_value: string;
    channel: DispatchChannel;
    status: string;
  }>) {
    if (row.status === "cancelled") continue;
    result.any.add(row.contact_value);
    if (row.channel === "whatsapp" || row.channel === "email") {
      result.byChannel[row.channel].add(row.contact_value);
    }
  }
  return result;
}

export async function fetchDispatchHistory(
  filters: DispatchHistoryFilters = {},
): Promise<DispatchLogRow[]> {
  let query = (supabase as any)
    .from("dispatch_logs")
    .select("*, message_templates(name)")
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 500);

  if (filters.channel && filters.channel !== "all") {
    query = query.eq("channel", filters.channel);
  }
  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.templateId && filters.templateId !== "all") {
    query = query.eq("template_id", filters.templateId);
  }
  if (filters.fromDate) {
    query = query.gte("created_at", filters.fromDate);
  }
  if (filters.toDate) {
    query = query.lte("created_at", filters.toDate);
  }

  const { data, error } = await query;
  if (error) {
    console.error("fetchDispatchHistory error:", error);
    throw error;
  }

  const rows = ((data ?? []) as Array<DispatchLogRow & {
    message_templates?: { name: string } | null;
  }>).map((row) => ({
    ...row,
    template_name: row.message_templates?.name ?? null,
  }));

  if (filters.search?.trim()) {
    const needle = filters.search.toLowerCase();
    return rows.filter((r) => {
      const company = r.lead_snapshot?.companyName?.toLowerCase() ?? "";
      const contact = r.contact_value?.toLowerCase() ?? "";
      return company.includes(needle) || contact.includes(needle);
    });
  }

  return rows;
}

export async function fetchDispatchStats(
  filters: Pick<DispatchHistoryFilters, "channel" | "fromDate" | "toDate"> = {},
): Promise<DispatchStats> {
  let query = (supabase as any)
    .from("dispatch_logs")
    .select("status, delivered_at, read_at, replied_at");

  if (filters.channel && filters.channel !== "all") {
    query = query.eq("channel", filters.channel);
  }
  if (filters.fromDate) {
    query = query.gte("created_at", filters.fromDate);
  }
  if (filters.toDate) {
    query = query.lte("created_at", filters.toDate);
  }

  const { data, error } = await query;
  if (error) {
    console.error("fetchDispatchStats error:", error);
    throw error;
  }

  const rows = (data ?? []) as Array<{
    status: string;
    delivered_at: string | null;
    read_at: string | null;
    replied_at: string | null;
  }>;

  const stats: DispatchStats = {
    total: rows.length,
    sent: 0,
    delivered: 0,
    read: 0,
    replied: 0,
    failed: 0,
    cancelled: 0,
    deliveryRate: 0,
    readRate: 0,
    replyRate: 0,
  };

  // sent counts every row that left the system (sent, delivered, read, replied
  // are progressive states — a "read" row was also "sent" and "delivered").
  for (const r of rows) {
    if (r.status === "failed" || r.status === "undelivered") stats.failed++;
    else if (r.status === "cancelled") stats.cancelled++;
    else stats.sent++;

    if (r.delivered_at) stats.delivered++;
    if (r.read_at) stats.read++;
    if (r.replied_at) stats.replied++;
  }

  if (stats.sent > 0) {
    stats.deliveryRate = Math.round((stats.delivered / stats.sent) * 100);
    stats.readRate = Math.round((stats.read / stats.sent) * 100);
    stats.replyRate = Math.round((stats.replied / stats.sent) * 100);
  }

  return stats;
}

export async function resendDispatchLog(_logId: string) {
  // Placeholder — resend uses the same flow as a fresh dispatch.
  // The Histórico screen will route the user back to /disparos/novo with the
  // lead pre-selected via location.state, so this function is unused for now
  // but kept here as a hook point for future server-side retry logic.
  throw new Error("Use the dispatch flow on /disparos/novo to resend.");
}
