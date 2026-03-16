import { describe, it, expect } from "vitest";
import { normalizeContact, interpolate } from "./utils";

describe("normalizeContact", () => {
  describe("whatsapp channel", () => {
    it("formats 11-digit mobile (with 9)", () => {
      expect(normalizeContact("(11) 99999-9999", "whatsapp")).toBe("+5511999999999");
    });
    it("formats 10-digit landline", () => {
      expect(normalizeContact("(11) 3333-4444", "whatsapp")).toBe("+551133334444");
    });
    it("accepts already-E164 with 13 digits", () => {
      expect(normalizeContact("+5511999999999", "whatsapp")).toBe("+5511999999999");
    });
    it("returns null for invalid phone", () => {
      expect(normalizeContact("123", "whatsapp")).toBeNull();
    });
    it("returns null for empty string", () => {
      expect(normalizeContact("", "whatsapp")).toBeNull();
    });
    it("returns null when given an email-shaped string on whatsapp channel", () => {
      expect(normalizeContact("test@example.com", "whatsapp")).toBeNull();
    });
  });

  describe("email channel", () => {
    it("returns valid email as-is", () => {
      expect(normalizeContact("test@example.com", "email")).toBe("test@example.com");
    });
    it("returns null for string without @", () => {
      expect(normalizeContact("notanemail", "email")).toBeNull();
    });
    it("returns null for empty string", () => {
      expect(normalizeContact("", "email")).toBeNull();
    });
  });
});

describe("interpolate", () => {
  const lead = {
    id: "1",
    companyName: "Clínica São Lucas",
    cnae: "8640-2/05",
    estimatedRevenue: 100000,
    city: "Curitiba",
    state: "PR",
    phone: "(41) 99999-8888",
    email: "contato@saolucas.com",
    status: "found" as const,
    cnpj: "",
  };

  it("replaces all known variables", () => {
    const tpl = "Olá {{nomeEmpresa}} de {{cidade}}/{{estado}}!";
    expect(interpolate(tpl, lead)).toBe("Olá Clínica São Lucas de Curitiba/PR!");
  });
  it("replaces multiple occurrences", () => {
    const tpl = "{{nomeEmpresa}} — {{nomeEmpresa}}";
    expect(interpolate(tpl, lead)).toBe("Clínica São Lucas — Clínica São Lucas");
  });
  it("leaves unknown variables untouched", () => {
    const tpl = "{{unknown}} teste";
    expect(interpolate(tpl, lead)).toBe("{{unknown}} teste");
  });
  it("handles empty phone and email gracefully", () => {
    const leadNoContact = { ...lead, phone: "", email: "" };
    const tpl = "Tel: {{telefone}} | Email: {{email}}";
    expect(interpolate(tpl, leadNoContact)).toBe("Tel:  | Email: ");
  });
});
