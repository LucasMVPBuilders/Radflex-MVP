import { describe, expect, it } from "vitest";
import { isSdrResponse } from "./validateSdrResponse";

describe("isSdrResponse", () => {
  it("accepts non-final response with nextMessage", () => {
    const payload = {
      isFinal: false,
      nextMessage: "Pergunta objetiva para qualificar",
      summary: "Ainda faltam dados para decidir",
      reason: "Faltam informações criticas",
      confidence: 0.55,
    };

    expect(isSdrResponse(payload)).toBe(true);
  });

  it("accepts final response with decision and nextMessage", () => {
    const payload = {
      isFinal: true,
      decision: "qualified",
      nextMessage: "Perfeito, vamos avancar. Proximo passo...",
      summary: "Lead qualificado apos conversas",
      reason: "Ha interesse e criterios atendidos",
      confidence: 0.84,
    };

    expect(isSdrResponse(payload)).toBe(true);
  });

  it("rejects final response without decision", () => {
    const payload = {
      isFinal: true,
      nextMessage: "Ok",
      summary: "Resumo",
      reason: "Motivo",
    };

    expect(isSdrResponse(payload)).toBe(false);
  });

  it("rejects non-final response with invalid decision", () => {
    const payload = {
      isFinal: false,
      decision: "wrong",
      nextMessage: "Pergunta",
      summary: "Resumo",
      reason: "Motivo",
    };

    expect(isSdrResponse(payload)).toBe(false);
  });
});

