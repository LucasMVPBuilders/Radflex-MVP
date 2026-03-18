import { DispatchChannel } from "@/lib/dispatch/types";

export type PipelineStageSeed = {
  key: string;
  name: string;
  position: number;
  color: string;
  isSystem: boolean;
};

export type PipelineStage = {
  id: string;
  key: string;
  name: string;
  position: number;
  color: string | null;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PipelineLeadSnapshot = {
  companyName: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  cnae: string;
  website?: string;
  address?: string;
};

export type PipelineLead = {
  id: string;
  leadId: string;
  dispatchLogId: string | null;
  currentStageId: string;
  currentStageKey: string;
  currentStageName: string;
  primaryChannel: DispatchChannel;
  contactPhone: string | null;
  contactEmail: string | null;
  latestMessagePreview: string | null;
  latestMessageAt: string | null;
  latestDirection: "inbound" | "outbound" | null;
  unreadCount: number;
  leadSnapshot: PipelineLeadSnapshot;
  createdAt: string;
  updatedAt: string;
};

export type ConversationMessage = {
  id: string;
  pipelineLeadId: string;
  channel: DispatchChannel;
  direction: "inbound" | "outbound";
  providerMessageId: string | null;
  body: string;
  status: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};
