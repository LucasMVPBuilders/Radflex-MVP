import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

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
const TWILIO_WHATSAPP_FROM = Deno.env.get('TWILIO_WHATSAPP_FROM') ?? '';
const TWILIO_SMS_FROM = Deno.env.get('TWILIO_SMS_FROM') ?? '';
const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY') ?? '';
const SENDGRID_FROM_EMAIL = Deno.env.get('SENDGRID_FROM_EMAIL') ?? '';

type Channel = 'whatsapp' | 'sms' | 'email';

interface SendMessagePayload {
  channel: Channel;
  to: string;
  message: string;
  subject?: string; // required for email, ignored otherwise
}

async function sendViaTwilio(payload: SendMessagePayload) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error('Twilio credentials not configured');
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;

  const from =
    payload.channel === 'whatsapp'
      ? TWILIO_WHATSAPP_FROM
      : TWILIO_SMS_FROM;

  if (!from) {
    throw new Error(
      payload.channel === 'whatsapp'
        ? 'TWILIO_WHATSAPP_FROM not configured'
        : 'TWILIO_SMS_FROM not configured'
    );
  }

  const body = new URLSearchParams();
  body.set('From', payload.channel === 'whatsapp' ? `whatsapp:${from.replace('whatsapp:', '')}` : from);
  body.set('To', payload.channel === 'whatsapp' ? `whatsapp:${payload.to.replace('whatsapp:', '')}` : payload.to);
  body.set('Body', payload.message);

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

async function sendEmailViaSendGrid(to: string, subject: string, body: string) {
  if (!SENDGRID_API_KEY) {
    throw new Error('SENDGRID_API_KEY not configured');
  }
  if (!SENDGRID_FROM_EMAIL) {
    throw new Error('SENDGRID_FROM_EMAIL not configured');
  }

  const payload = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: SENDGRID_FROM_EMAIL },
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
    throw new Error(`Erro ao enviar email via SendGrid (${res.status})`);
  }

  return { status: res.status };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { channel, to, message, subject } = (await req.json()) as SendMessagePayload;

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

    // Email → SendGrid (subject required)
    if (channel === 'email') {
      if (!subject) {
        return new Response(
          JSON.stringify({ success: false, error: 'Parâmetro "subject" obrigatório para canal email.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const result = await sendEmailViaSendGrid(to, subject, message);
      return new Response(
        JSON.stringify({ success: true, data: result }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // WhatsApp / SMS → Twilio
    const twilioResult = await sendViaTwilio({ channel, to, message });

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
