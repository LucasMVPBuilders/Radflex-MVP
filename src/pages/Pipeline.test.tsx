import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Pipeline from "./Pipeline";

const fetchPipelineStagesMock = vi.fn();
const fetchPipelineLeadsMock = vi.fn();
const fetchConversationMessagesMock = vi.fn();
const markPipelineLeadAsReadMock = vi.fn();
const movePipelineLeadStageMock = vi.fn();

vi.mock("@/lib/api/pipeline", () => ({
  fetchPipelineStages: () => fetchPipelineStagesMock(),
  fetchPipelineLeads: () => fetchPipelineLeadsMock(),
  fetchConversationMessages: (...args: unknown[]) => fetchConversationMessagesMock(...args),
  markPipelineLeadAsRead: (...args: unknown[]) => markPipelineLeadAsReadMock(...args),
  movePipelineLeadStage: (...args: unknown[]) => movePipelineLeadStageMock(...args),
}));

vi.mock("@/components/AppSidebar", () => ({
  AppSidebar: () => <div>Sidebar</div>,
}));

describe("Pipeline page", () => {
  beforeEach(() => {
    fetchPipelineStagesMock.mockReset();
    fetchPipelineLeadsMock.mockReset();
    fetchConversationMessagesMock.mockReset();
    markPipelineLeadAsReadMock.mockReset();
    movePipelineLeadStageMock.mockReset();

    fetchPipelineStagesMock.mockResolvedValue([
      {
        id: "stage-1",
        key: "dispatch_started",
        name: "Disparo iniciado",
        position: 0,
        color: "#5B2ECC",
        isActive: true,
        isSystem: true,
        createdAt: "2026-03-18T00:00:00.000Z",
        updatedAt: "2026-03-18T00:00:00.000Z",
      },
      {
        id: "stage-2",
        key: "replied",
        name: "Respondeu",
        position: 1,
        color: "#0EA5E9",
        isActive: true,
        isSystem: true,
        createdAt: "2026-03-18T00:00:00.000Z",
        updatedAt: "2026-03-18T00:00:00.000Z",
      },
    ]);

    fetchPipelineLeadsMock.mockResolvedValue([
      {
        id: "lead-1",
        leadId: "saved:lead-1",
        dispatchLogId: "dispatch-1",
        currentStageId: "stage-1",
        currentStageKey: "dispatch_started",
        currentStageName: "Disparo iniciado",
        primaryChannel: "whatsapp",
        contactPhone: "+5511940450386",
        contactEmail: "",
        latestMessagePreview: "Primeiro contato enviado",
        latestMessageAt: "2026-03-18T10:00:00.000Z",
        latestDirection: "outbound",
        unreadCount: 1,
        leadSnapshot: {
          companyName: "Clínica Exemplo",
          phone: "+5511940450386",
          email: "",
          city: "São Paulo",
          state: "SP",
          cnae: "8640-2/05",
        },
        createdAt: "2026-03-18T10:00:00.000Z",
        updatedAt: "2026-03-18T10:00:00.000Z",
      },
    ]);

    fetchConversationMessagesMock.mockResolvedValue([
      {
        id: "message-1",
        pipelineLeadId: "lead-1",
        channel: "whatsapp",
        direction: "outbound",
        providerMessageId: "SM123",
        body: "Primeiro contato enviado",
        status: "queued",
        metadata: null,
        createdAt: "2026-03-18T10:00:00.000Z",
      },
    ]);
  });

  it("renders the kanban stages and opens the lead conversation drawer", async () => {
    render(<Pipeline />);

    expect(await screen.findByText("Pipeline de Leads")).toBeInTheDocument();
    expect(screen.getByText("Disparo iniciado")).toBeInTheDocument();
    expect(screen.getByText("Respondeu")).toBeInTheDocument();
    expect(screen.getByText("Clínica Exemplo")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /clínica exemplo/i }));

    expect(await screen.findByText("Conversa do lead")).toBeInTheDocument();
    expect((await screen.findAllByText("Primeiro contato enviado")).length).toBeGreaterThan(1);

    await waitFor(() => {
      expect(fetchConversationMessagesMock).toHaveBeenCalledWith("lead-1");
      expect(markPipelineLeadAsReadMock).toHaveBeenCalledWith("lead-1");
    });
  });
});
