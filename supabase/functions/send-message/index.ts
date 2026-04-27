// @ts-expect-error - Deno JSR side-effect import (resolved at runtime in Supabase)
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
// @ts-expect-error - Deno JSR import (resolved at runtime in Supabase)
import { createClient } from 'jsr:@supabase/supabase-js@2';

declare const Deno: {
  env: {
    get: (name: string) => string | undefined;
  };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const TWILIO_WHATSAPP_FROM_FALLBACK = Deno.env.get('TWILIO_WHATSAPP_FROM') ?? '';
const TWILIO_SMS_FROM_FALLBACK = Deno.env.get('TWILIO_SMS_FROM') ?? '';
const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY') ?? '';
const SENDGRID_FROM_EMAIL_FALLBACK = Deno.env.get('SENDGRID_FROM_EMAIL') ?? '';
const SUPABASE_URL_FOR_CALLBACK = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Loads sender values from app_settings, falling back to env vars when the row
// has a null/empty value for that field. Edge Function instance is short-lived
// so a fresh fetch per invocation is fine for this volume.
async function loadSenderConfig(): Promise<{
  whatsappFrom: string;
  smsFrom: string;
  sendgridFrom: string;
}> {
  const fallback = {
    whatsappFrom: TWILIO_WHATSAPP_FROM_FALLBACK,
    smsFrom: TWILIO_SMS_FROM_FALLBACK,
    sendgridFrom: SENDGRID_FROM_EMAIL_FALLBACK,
  };

  if (!SUPABASE_URL_FOR_CALLBACK || !SUPABASE_SERVICE_ROLE_KEY) {
    return fallback;
  }

  try {
    const sb = createClient(SUPABASE_URL_FOR_CALLBACK, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await sb
      .from('app_settings')
      .select('twilio_whatsapp_from, twilio_sms_from, sendgrid_from_email')
      .eq('id', true)
      .maybeSingle();

    return {
      whatsappFrom: (data?.twilio_whatsapp_from as string | null) || fallback.whatsappFrom,
      smsFrom: (data?.twilio_sms_from as string | null) || fallback.smsFrom,
      sendgridFrom: (data?.sendgrid_from_email as string | null) || fallback.sendgridFrom,
    };
  } catch (e) {
    console.error('Failed to load app_settings, using env fallbacks:', e);
    return fallback;
  }
}

type Channel = 'whatsapp' | 'sms' | 'email';

interface SendMessagePayload {
  channel: Channel;
  to: string;
  message: string;
  subject?: string; // required for email, ignored otherwise
  // HSM (WhatsApp pre-approved template) — only valid for channel=whatsapp
  contentSid?: string;
  contentVariables?: Record<string, string>;
}

async function sendViaTwilio(
  payload: SendMessagePayload,
  config: { whatsappFrom: string; smsFrom: string },
) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error('Twilio credentials not configured');
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;

  const from =
    payload.channel === 'whatsapp' ? config.whatsappFrom : config.smsFrom;

  if (!from) {
    throw new Error(
      payload.channel === 'whatsapp'
        ? 'TWILIO_WHATSAPP_FROM não configurado (defina em /configuracoes ou nos secrets).'
        : 'TWILIO_SMS_FROM não configurado (defina em /configuracoes ou nos secrets).'
    );
  }

  const body = new URLSearchParams();
  body.set('From', payload.channel === 'whatsapp' ? `whatsapp:${from.replace('whatsapp:', '')}` : from);
  body.set('To', payload.channel === 'whatsapp' ? `whatsapp:${payload.to.replace('whatsapp:', '')}` : payload.to);

  // HSM mode (WhatsApp pre-approved template) takes priority over freeform Body.
  // ContentSid + ContentVariables let Twilio render the template approved by
  // Meta — required to start conversations outside the 24h window.
  if (payload.contentSid && payload.channel === 'whatsapp') {
    body.set('ContentSid', payload.contentSid);
    if (payload.contentVariables && Object.keys(payload.contentVariables).length > 0) {
      body.set('ContentVariables', JSON.stringify(payload.contentVariables));
    }
  } else {
    body.set('Body', payload.message);
  }

  // Status callback so Twilio notifies us about queued/sent/delivered/read/failed
  // transitions and we can keep dispatch_logs in sync.
  if (SUPABASE_URL_FOR_CALLBACK) {
    body.set('StatusCallback', `${SUPABASE_URL_FOR_CALLBACK}/functions/v1/twilio-status-webhook`);
  }

  const basicAuth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('Twilio error response:', data);
    throw new Error(data?.message || `Erro ao enviar mensagem via Twilio (${res.status})`);
  }

  return data;
}

async function sendEmailViaSendGrid(
  to: string,
  subject: string,
  body: string,
  fromEmail: string,
) {
  if (!SENDGRID_API_KEY) {
    throw new Error('SENDGRID_API_KEY not configured');
  }
  if (!fromEmail) {
    throw new Error('SENDGRID_FROM_EMAIL não configurado (defina em /configuracoes ou nos secrets).');
  }

  const payload = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: fromEmail },
    subject,
    content: [{ type: 'text/plain', value: body }],
  };

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('SendGrid error:', text);
    const snippet = text?.slice?.(0, 500) ?? "";
    throw new Error(`Erro ao enviar email via SendGrid (${res.status}): ${snippet}`);
  }

  return { status: res.status };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { channel, to, message, subject, contentSid, contentVariables } =
      (await req.json()) as SendMessagePayload;

    if (!channel || !to || !message) {
      return new Response(
        JSON.stringify({ success: false, error: 'Parâmetros obrigatórios: channel, to, message' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // UPDATED: validation guard includes 'email'
    if (!['whatsapp', 'sms', 'email'].includes(channel)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Canal inválido. Use "whatsapp", "sms" ou "email".' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Load sender config (DB → env fallback) once per invocation
    const senderConfig = await loadSenderConfig();

    // Email → SendGrid (subject required)
    if (channel === 'email') {
      if (!subject) {
        return new Response(
          JSON.stringify({ success: false, error: 'Parâmetro "subject" obrigatório para canal email.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const result = await sendEmailViaSendGrid(
        to,
        subject,
        message,
        senderConfig.sendgridFrom,
      );
      return new Response(
        JSON.stringify({ success: true, data: result }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // WhatsApp / SMS → Twilio
    const twilioResult = await sendViaTwilio(
      { channel, to, message, contentSid, contentVariables },
      { whatsappFrom: senderConfig.whatsappFrom, smsFrom: senderConfig.smsFrom },
    );

    return new Response(
      JSON.stringify({ success: true, data: twilioResult }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('send-message error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao enviar mensagem',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
