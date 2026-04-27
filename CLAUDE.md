# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Project docs are the source of truth.** This file documents only what isn't already covered by:
> - `README.md` — overall stack, Apify integration, ADRs, env setup
> - `DESIGN_SYSTEM.md` — colors, fonts, gradients, component conventions
> - `docs/MANUAL-API-SCRAPING.md` — deep dive on `search-cnae` + Apify flow
>
> Read those first when the task touches what they cover. CLAUDE.md fills the gaps.

---

## Commands

Package manager: both `bun` and `npm` work — `bun.lockb` is committed alongside `package-lock.json`. Prefer `bun` if available (faster), but either is fine.

```sh
bun install                     # or: npm install
bun run dev                     # Vite dev server on http://localhost:8080  (NOT 5173 — vite.config.ts overrides default)
bun run build                   # production build
bun run build:dev               # build with mode=development (sourcemaps, no minify)
bun run lint                    # eslint
bun run test                    # vitest run (single pass)
bun run test:watch              # vitest in watch mode

# Run a single test file or pattern:
bun run test src/lib/pipeline/utils.test.ts
bun run test -t "registers dispatch"     # by test name regex
```

Vitest config (`vitest.config.ts`) uses `jsdom` + globals — no need to import `describe/it/expect`. Setup file: `src/test/setup.ts` (mocks `matchMedia`).

Playwright is installed (`playwright.config.ts`, `playwright-fixture.ts`) but no E2E suite exists yet. Don't assume E2E coverage.

---

## Big-picture architecture

The README covers the **acquisition** path (search-cnae → Apify). The codebase has since grown three more modules that work together as one funnel:

```
ACQUISITION → DISPATCH → INBOUND → SDR → PIPELINE
   Apify       Twilio/    Twilio    OpenAI   Kanban
              SendGrid   webhook
```

| Stage | Frontend page | Edge Function | External API | Key tables |
|-------|---------------|---------------|--------------|------------|
| Acquisition | `/` (`Index.tsx`) | `search-cnae`, `apify-usage` | Apify | `leads`, `scraping_runs`, `cnae_filters` |
| Dispatch | `/disparos` (`Disparos.tsx`) | `send-message` | Twilio (WA/SMS), SendGrid (email) | `dispatch_logs`, `dispatch_templates` |
| Inbound | — (server-only) | `twilio-webhook` | Twilio inbound webhook | `conversation_messages` |
| SDR | `/sdr` (config), runs server-side | `sdr-qualify` | OpenAI (`gpt-4o`) | `sdr_prompts`, `pipeline_leads` |
| Pipeline (CRM) | `/pipeline` (`Pipeline.tsx`) | — (direct DB) | — | `pipeline_stages`, `pipeline_leads`, `conversation_messages` |

### How a lead flows through the system

1. **Search** — User adds a CNAE in the sidebar of `/`. `searchLeadsByCnae()` (`src/lib/api/searchLeads.ts`) calls `search-cnae` with `mode: "start"`, gets back `apifyRunId` + `datasetId`, then **polls from the frontend** (5s interval, max 6 min) with `mode: "poll"` until `status: "done"`. The README/`docs/MANUAL-API-SCRAPING.md` describe this in depth — note that the README's "polling inside the edge function" wording is outdated; polling is now client-driven.

2. **Dispatch** — `/disparos` lets the user pick leads + a template, then loops `sendMessage()` (`src/lib/api/sendMessage.ts`) → `send-message` Edge Function. `send-message` routes by `channel`: `whatsapp`/`sms` → Twilio, `email` → SendGrid. After each send, `registerDispatchToPipeline()` (`src/lib/api/pipeline.ts`) creates/updates a `pipeline_leads` row in the `dispatch_started` stage and writes the outbound `conversation_messages` row.

3. **Inbound reply** — Twilio POSTs `application/x-www-form-urlencoded` to `twilio-webhook`. The webhook normalizes the phone (`+55` prefix), matches `pipeline_leads.contact_phone` (exact then suffix-fallback by last 11 digits), inserts the inbound `conversation_messages`, increments `unread_count`, and **moves the lead to `replied`** *unless* the lead is already in a final stage (`qualified`/`desqualified`).

4. **SDR auto-qualify** — After recording the inbound message, `twilio-webhook` fires `sdr-qualify` (fire-and-forget) with `pipelineLeadId`. `sdr-qualify`:
   - Loads the active `sdr_prompts.prompt`, fills `{{companyName}}`, `{{leadStage}}`, `{{latestInboundMessage}}`, `{{conversation}}` placeholders.
   - **Two-step OpenAI call:** (a) free-form "thinking" pass at `temperature: 0.5` analyzes tone/intent, then (b) JSON-strict pass at `temperature: 0.3` produces `{ isFinal, decision, nextMessage, summary, reason, confidence }`. The thinking output is fed back as an assistant message before the JSON pass.
   - If `nextMessage` is non-empty, sends it via `send-message` and records as outbound.
   - Updates `current_stage_id` to `qualified` / `desqualified` (when `isFinal`) or `sdr_talking` (mid-conversation), and persists `sdr_last_*` fields on `pipeline_leads`.

5. **Pipeline UI** — `/pipeline` reads `pipeline_stages` + `pipeline_leads` directly via the Supabase client, shows a kanban, and supports manual replies via `sendPipelineMessage()` (which goes through `send-message` again, same path as dispatch).

### Why this matters for editing

- **Don't break the stage-key contract.** The keys `dispatch_started`, `replied`, `qualified`, `desqualified`, `sdr_talking`, `proposal`, `closed` are referenced as string literals across `twilio-webhook/index.ts`, `sdr-qualify/index.ts`, and `src/lib/pipeline/utils.ts`. They're seeded in `supabase/migrations/20260318000003_pipeline.sql` and `20260318000007_sdr.sql`. If you rename one, search the whole tree.
- **The pipeline is the join point.** Acquisition leaves data in `leads`, but the moment a lead is dispatched it's mirrored into `pipeline_leads` (with a `lead_snapshot` JSON copy). After dispatch, the kanban is the source of truth — `leads` is no longer touched for that contact.
- **Phone normalization is fragile.** `normalizePipelinePhone()` exists in two places: `src/lib/pipeline/utils.ts` (frontend) and inline in `supabase/functions/twilio-webhook/index.ts` (Deno). They must stay in sync — Twilio's `From` field can arrive as `whatsapp:+55...`, `+55...`, or just digits.

---

## Path alias

`@/*` → `src/*` is configured in three places that must agree: `tsconfig.app.json`, `vite.config.ts`, `vitest.config.ts`. Always import with `@/...`, not relative `../../`.

---

## Edge Function conventions (Deno)

All Edge Functions live in `supabase/functions/<name>/index.ts` and run on Deno, not Node. Two import styles coexist in the repo:

- **Newer functions** (`send-message`, `twilio-webhook`, `sdr-qualify`) use `jsr:@supabase/functions-js/edge-runtime.d.ts` and `jsr:@supabase/supabase-js@2`.
- **Older function** (`search-cnae`) uses `https://esm.sh/@supabase/supabase-js@2`.

When adding a new function, follow the **JSR** style. Don't mix the two in one file.

`Deno.env.get("...")` reads secrets configured in **Supabase Dashboard → Edge Functions → Secrets**. Required secrets per function:

| Function | Secrets it reads |
|----------|------------------|
| `search-cnae` | `APIFY_API_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `apify-usage` | `APIFY_API_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `send-message` | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_SMS_FROM`, `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` |
| `twilio-webhook` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `sdr-qualify` | `OPENAI_API_KEY`, `OPENAI_MODEL` (optional, defaults `gpt-4o`), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |

Most functions are deployed with `verify_jwt: false` (callable with the anon key from the browser). `twilio-webhook` is also public — it's authenticated by the Twilio webhook signature being on a known URL, not by JWT.

---

## TypeScript & DB types

- `tsconfig.app.json` is intentionally **non-strict** (`strict: false`, `noImplicitAny: false`, `noUnusedLocals: false`). Don't fight this — match the surrounding style rather than introducing strict patterns piecemeal.
- The generated `Database` type in `src/integrations/supabase/types.ts` does **not** include the newer pipeline/SDR tables. The codebase works around this by casting: `(supabase as any).from("pipeline_leads")...`. This is intentional — when you add queries to those tables, do the same. Don't try to "fix" it by adding hand-written types unless you're regenerating from the schema.

---

## Auth

Routes are split in `src/App.tsx`:
- **Public:** `/login`, `/reset-password`, `/update-password`
- **Protected** (wrapped in `<ProtectedRoute />`): `/`, `/disparos`, `/pipeline`, `/sdr`, `/test-chat`

`ProtectedRoute` (`src/components/ProtectedRoute.tsx`) checks `supabase.auth.getSession()` for fast first paint, then subscribes to `onAuthStateChange` as the source of truth. Sessions persist via `localStorage` (`src/integrations/supabase/client.ts`).

The Edge Functions, however, are **not** behind user auth — they run with the service role key from secrets and trust callers. Don't add per-user authorization checks in Edge Functions without first deciding whether the table RLS already covers the case.

---

## UI conventions

- **shadcn/ui** components are vendored under `src/components/ui/` (49 of them). Edit them in place. `components.json` declares the install paths; re-running the shadcn CLI will overwrite local edits.
- **Design tokens** are HSL triples *without* the `hsl()` wrapper in `src/index.css` (e.g. `--primary: 257 63% 49%`). This is required for Tailwind opacity modifiers like `bg-primary/15`. Don't switch to `#hex` or wrapped `hsl(...)` — see `DESIGN_SYSTEM.md`.
- **Fonts** are imported via `@fontsource/*` in `src/main.tsx` (Sora, Inter, JetBrains Mono). The body inherits Sora through Tailwind's `font-sans` — no `font-sans` className needed on most elements.
- **Gradients** use utility classes (`.gradient-primary`, `.gradient-dark`, `.gradient-soft`, `.gradient-light`) defined in `src/index.css`. Don't inline gradient stops.

---

## Gotchas worth knowing

- **`estimateRevenue` is a heuristic**, not real data. It's derived from Google reviews count in `supabase/functions/search-cnae/index.ts`. It shows up in the leads table and CSV export — if a stakeholder asks why the numbers look round, this is why. Don't extend the heuristic without flagging that the column is fictional.
- **CNAE descriptions are mapped for only 3 codes** in `search-cnae/index.ts` (`8640205`, `8640207`, `8640204`). Other CNAEs fall back to `searchTerms` from the frontend or the raw code. Adding a new "well-known" CNAE means editing `CNAE_DESCRIPTIONS` in the Edge Function — *not* a frontend change.
- **CSV export uses `;` and a UTF-8 BOM** for Excel-on-Windows compatibility. Don't switch to `,` without confirming downstream consumers.
- **Migration files are timestamped `20260...`** — the project intentionally uses 2026 dates. Match the convention when adding new migrations: `YYYYMMDDHHMMSS_<slug>.sql`.

---

## When in doubt

- Apify / scraping question → `docs/MANUAL-API-SCRAPING.md`
- Visual / token / component-style question → `DESIGN_SYSTEM.md`
- Stack / deploy / env-var question → `README.md`
- Pipeline / SDR / dispatch flow → this file + read the relevant Edge Function in `supabase/functions/`
