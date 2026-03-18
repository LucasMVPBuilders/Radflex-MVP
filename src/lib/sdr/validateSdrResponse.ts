export type SdrDecision = "qualified" | "desqualified";

export type SdrResponse = {
  isFinal: boolean;
  decision?: SdrDecision;
  nextMessage: string | null;
  summary: string;
  reason: string;
  confidence?: number;
};

export function isSdrResponse(payload: any): payload is SdrResponse {
  if (!payload) return false;
  if (typeof payload.isFinal !== "boolean") return false;
  if (
    payload.decision !== undefined &&
    payload.decision !== null &&
    payload.decision !== "qualified" &&
    payload.decision !== "desqualified"
  ) {
    return false;
  }
  if (typeof payload.nextMessage !== "string" && payload.nextMessage !== null) return false;
  if (typeof payload.summary !== "string") return false;
  if (typeof payload.reason !== "string") return false;
  if (payload.confidence !== undefined && typeof payload.confidence !== "number") return false;

  if (payload.isFinal) {
    return payload.decision === "qualified" || payload.decision === "desqualified";
  }

  return true;
}

