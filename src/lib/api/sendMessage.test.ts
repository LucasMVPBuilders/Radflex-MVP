import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendMessage } from "./sendMessage";

const invokeMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

describe("sendMessage", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("returns the edge function error payload when Supabase responds with a non-2xx status", async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: {
          json: vi.fn().mockResolvedValue({
            error: "Twilio credentials not configured",
          }),
        },
      },
    });

    const result = await sendMessage({
      channel: "whatsapp",
      to: "+5511940450386",
      message: "Teste",
    });

    expect(result).toEqual({
      success: false,
      error: "Twilio credentials not configured",
    });
  });

  it("returns success when the edge function succeeds", async () => {
    invokeMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          sid: "SM123",
          status: "queued",
        },
      },
      error: null,
    });

    const result = await sendMessage({
      channel: "whatsapp",
      to: "+5511940450386",
      message: "Teste",
    });

    expect(result).toEqual({
      success: true,
      data: {
        sid: "SM123",
        status: "queued",
      },
    });
  });
});
