// @ts-expect-error - Deno JSR side-effect import (resolved at runtime in Supabase)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: {
  env: { get: (name: string) => string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY") ?? "";

interface TestResult {
  ok: boolean;
  detail?: string;
  error?: string;
}

function jsonResponse(body: TestResult, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function testTwilio(): Promise<TestResult> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return {
      ok: false,
      error: "TWILIO_ACCOUNT_SID ou TWILIO_AUTH_TOKEN não configurados nos secrets.",
    };
  }

  const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}.json`,
      { headers: { Authorization: `Basic ${auth}` } },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        error: `Twilio respondeu ${res.status}: ${body.slice(0, 200)}`,
      };
    }

    const data = await res.json();
    return {
      ok: true,
      detail: `Conta Twilio: ${data.friendly_name ?? data.sid} (${data.status})`,
    };
  } catch (e) {
    return {
      ok: false,
      error: `Erro de rede ao chamar Twilio: ${(e as Error).message}`,
    };
  }
}

async function testSendgrid(): Promise<TestResult> {
  if (!SENDGRID_API_KEY) {
    return { ok: false, error: "SENDGRID_API_KEY não configurada nos secrets." };
  }

  try {
    const res = await fetch("https://api.sendgrid.com/v3/user/account", {
      headers: { Authorization: `Bearer ${SENDGRID_API_KEY}` },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        error: `SendGrid respondeu ${res.status}: ${body.slice(0, 200)}`,
      };
    }

    const data = await res.json();
    return {
      ok: true,
      detail: `SendGrid: tipo de conta ${data.type ?? "unknown"}`,
    };
  } catch (e) {
    return {
      ok: false,
      error: `Erro de rede ao chamar SendGrid: ${(e as Error).message}`,
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  let body: { provider?: string } = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "JSON inválido" }, 400);
  }

  if (body.provider === "twilio") {
    return jsonResponse(await testTwilio());
  }
  if (body.provider === "sendgrid") {
    return jsonResponse(await testSendgrid());
  }

  return jsonResponse(
    { ok: false, error: 'provider inválido (use "twilio" ou "sendgrid")' },
    400,
  );
});
