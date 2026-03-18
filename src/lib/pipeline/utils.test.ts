import { describe, expect, it } from "vitest";
import { createDefaultPipelineStages, normalizePipelinePhone } from "./utils";

describe("pipeline utils", () => {
  it("creates the default editable pipeline stages in the expected order", () => {
    expect(createDefaultPipelineStages()).toEqual([
      expect.objectContaining({ key: "dispatch_started", name: "Disparo iniciado", position: 0 }),
      expect.objectContaining({ key: "replied", name: "Respondeu", position: 1 }),
      expect.objectContaining({ key: "qualified", name: "Qualificado", position: 2 }),
      expect.objectContaining({ key: "proposal", name: "Proposta", position: 3 }),
      expect.objectContaining({ key: "closed", name: "Fechado", position: 4 }),
    ]);
  });

  it("normalizes whatsapp addresses from twilio payloads and local numbers", () => {
    expect(normalizePipelinePhone("whatsapp:+5511940450386")).toBe("+5511940450386");
    expect(normalizePipelinePhone("+5511940450386")).toBe("+5511940450386");
    expect(normalizePipelinePhone("(11) 94045-0386")).toBe("+5511940450386");
  });
});
