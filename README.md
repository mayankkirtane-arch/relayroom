# RelayRoom

**Phase 4 — public wall + monetisation.**

RelayRoom turns a sales call into a signed proposal, a Stripe checkout link, and a
zero-seat client portal in about 60 seconds. Phase 1 shipped the shell and schema,
phase 2 made the client room real, phase 3 turned the two agents into backend
routes, and phase 4 closes the loop: a public embeddable Wall of Love, working
plan/branding controls, and a $499 concierge order flow.

![Wall of Love](docs/preview/wall-of-love.png)

![AI agents](docs/preview/ai-agents.png)

![Client room](docs/preview/client-room.png)

## What works end-to-end

| Flow | Where | Persists to |
| --- | --- | --- |
| E-signature on the proposal | `/room/[token]` → Proposal | `proposals.signed_by_name`, `signed_at` |
| Simulated Stripe deposit | `/room/[token]` → Proposal | `proposals.paid_at`, portal → `onboarding` |
| Checklist: files, answers, approvals | `/room/[token]` → Onboarding | `onboarding_tasks` |
| Encrypted credential handover | `/room/[token]` → Onboarding | `credential_vault` (AES-256-GCM) |
| One-time secret reveal | `/dashboard/portals/[id]` | `viewed_at`, `wiped_at`, ciphertext cleared |
| Deliverable approval / revision | `/room/[token]` → Deliverables | `deliverables`, activity feed |
| Video or written testimonial | celebration modal | `testimonials` + `public/uploads` |
| Wall of Love publish/hide | `/dashboard/testimonials` | `testimonials.is_public_on_wall` |
| Public wall embed | `/embed/wall/[slug]` | public testimonials |
| Plan + branding changes | `/dashboard/billing` | `workspaces.plan_tier`, `remove_branding` |
| $499 concierge order | `/dashboard/setup` → intake | `setup_requests` |
| Reminders / link rotation | dashboard + portal detail | `chase_count`, `magic_token` |
| Activity feed | both sides | `activity_events` |
| Transcript → draft → live room | `/dashboard/ai-generator` → `/api/agents/call-to-portal` | portal + proposal + checklist + board |
| Overdue chaser preview/dispatch | drawer on dashboard and portal detail → `/api/agents/chaser` | `onboarding_tasks.chase_*`, `activity_events` |

Every write is a Next.js **server action** in `app/actions.ts`; every read goes
through `lib/db/store.ts`, so the UI is server-rendered from the database — not
from fixtures.

## Stack

- **Next.js 16.4** (App Router, Turbopack) + **React 19** + **TypeScript 5.9**
- **Tailwind CSS 4**, shadcn/ui-style primitives, Lucide, Geist
- **Turso / libSQL** (SQLite dialect). Money is integer cents everywhere.
- **Server Actions** for mutations, `node:crypto` AES-256-GCM for the vault,
  **MediaRecorder** for in-browser video testimonials.
- **Route Handlers** for the two agents, with optional OpenAI / DeepSeek / Gemini
  support and a deterministic fallback that needs no network.

## The two agents

### Agent 01 — Call to portal (`/dashboard/ai-generator`)

`POST /api/agents/call-to-portal` accepts a transcript + client fields.

- **With a key** (`OPENAI_API_KEY`, `DEEPSEEK_API_KEY` or `GEMINI_API_KEY`) it
  requests structured JSON: title, summary, 4–5 dated scope items, cents totals,
  5–6 onboarding tasks and 3–4 board cards. Every field is coerced and sanity
  checked — totals are reconciled against the budget mentioned in the call.
- **Without a key** a deterministic parser extracts budget (`$24,000`, `18k`,
  `1.5m`, currency symbols), services (Shopify, Meta/Google Ads, Klaviyo, HubSpot,
  Google Workspace, Calendly…), access requests, scope keywords and deposit
  percentage, then builds the same schema. The UI labels the provider honestly.
- **Create & launch** posts the reviewed draft back; one libSQL batch writes the
  portal, proposal, tasks, deliverables and two activity events, then returns the
  `/room/[magic_token]` URL. Three preset calls are included, and
  `/dashboard/new` redirects to the new page.

### Agent 02 — Bad Cop chaser

The “Send reminders” button on the dashboard banner and each portal detail opens a
drawer backed by `POST /api/agents/chaser`:

- **Preview** groups overdue tasks by client, shows the exact missing items, the
  number of days overdue, the projected launch date and how many business days it
  slips if the client misses the 24-hour window.
- Each client gets an **email (subject + body)** and a shorter **WhatsApp**
  message. With a provider configured the drafts are model-written; otherwise the
  same structure is generated from templates, including the room link.
- **Dispatch** increments `chase_count`, stamps `last_chased_at`, logs a chase
  activity per client and returns the counts; the drawer closes and a toast
  confirms. No email provider is connected — delivery itself is phase 4.

## Run it

```bash
npm install
cp .env.example .env.local     # or edit the generated one
npm run db:apply               # creates schema; demo data seeds on first request
npm run dev                    # http://localhost:4310/dashboard
```

No API keys are required. The demo workspace (Northlight Studio, 9 portals) is
materialised from `lib/mock-data.ts` on first boot by `lib/db/seed.ts` — including
credentials encrypted with your local key, because ciphertext cannot be seeded in
SQL. Both agents fall back to the deterministic local engine when no model key is
present.

### Environment

```env
TURSO_DATABASE_URL=file:.local/relayroom.db   # or libsql://…turso.io
TURSO_AUTH_TOKEN=
CREDENTIAL_ENCRYPTION_KEY=<base64 32 bytes>   # openssl rand -base64 32
NEXT_PUBLIC_APP_URL=http://localhost:4310     # used to build copyable magic links

# Optional — any one enables model-written copy
OPENAI_API_KEY=
DEEPSEEK_API_KEY=
GEMINI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
DEEPSEEK_MODEL=deepseek-chat
GEMINI_MODEL=gemini-2.0-flash
```

Without `CREDENTIAL_ENCRYPTION_KEY`, the vault actions refuse to run. That is
intentional: a missing key must never silently store plaintext.

## The client room

`/room/[magic_token]` is the zero-seat surface. No account, no invite, no seat.

- **Branded shell** — workspace logo/monogram, brand colour, agency name, secure
  link badge. Colour is injected as `--brand` and used for CTAs and progress.
- **Proposal** — scope with dates, price breakdown, legal-name signature, then a
  deposit button that flips the portal to `onboarding`.
- **Onboarding** — per-type interactions: file links, questionnaire answers,
  approvals, and inline credential cards. Open credential tasks expand by default.
- **Vault** — secrets are encrypted server-side before insert; the UI only ever
  shows “Sealed”. The agency gets one reveal; the ciphertext is destroyed.
- **Deliverables** — three-column board. Approval opens the celebration modal;
  requesting a revision writes feedback and moves the card back to To do.
- **Testimonials** — 5-star rating, written quote, or a 30s webcam recording via
  `MediaRecorder`. Text posts instantly; video is written to `public/uploads/` and
  stored on the testimonial row.
- **Viral badge** — when `remove_branding` is false, a floating “Powered by
  RelayRoom” badge links to `/dashboard`.

## Viral loop & monetisation

### Public embeddable wall (`/embed/wall/[workspace_slug]`)

A standalone, iframe-friendly page rendering every public testimonial with video
or video-poster, stars, a verified-client badge and a “Verified via RelayRoom”
footer. Query params: `theme=light|dark`, `layout=grid|carousel`, `ratings=0|1`,
`videos=0|1`, `accent=#hex` — all validated server-side, with `accent` falling back
to the workspace brand colour.

`/dashboard/testimonials` shows the **live public page inside an iframe**, updates
it as settings change, and copies either an `<iframe>` snippet or a `<script>`
snippet that injects the iframe. Hiding a testimonial updates the wall on the next
request.

### Plans and branding (real writes)

Billing switches between **Free $0**, **Solo Pro $49/mo** and **Agency Unlimited
$129/mo** by updating `workspaces.plan_tier`. Limits, the header badge and the
billing card all re-render immediately. A branding switch writes
`workspaces.remove_branding`; it is disabled on Free and reset on downgrade, so the
floating badge in `/room/[magic_token]` appears and disappears for real.

### $499 concierge order

The 48h Setup page now has a real intake form: contact, agency, Notion, Drive and
SuiteDash/ClickUp links plus notes. Submitting validates at least one `https` link,
writes a `setup_requests` row with `amount_cents = 49900` and `status = 'paid'`,
logs a `setup` activity, and lists the order (with its links and paid badge) on the
page. Payment is simulated — no card is charged.

## Screens

| | |
| --- | --- |
| [Dashboard](docs/preview/dashboard.png) | [Client room](docs/preview/client-room.png) |
| [Proposal](docs/preview/client-room-proposal.png) | [Onboarding + vault](docs/preview/client-room-vault.png) |
| [Deliverable board](docs/preview/client-room-board.png) | [Portal detail](docs/preview/portal-detail.png) |
| [AI agents](docs/preview/ai-agents.png) | [AI generator](docs/preview/ai-generator.png) |
| [Chaser drawer](docs/preview/chaser.png) | [Wall of Love](docs/preview/wall-of-love.png) |
| [Billing](docs/preview/billing.png) | [48h setup](docs/preview/setup.png) |

## Database

```
workspaces 1─┬─< client_portals 1─┬─< proposals
             │                    ├─< onboarding_tasks
             │                    ├─< credential_vault
             │                    ├─< deliverables
             │                    └─< testimonials
             ├─< activity_events
             └─< testimonials     (workspace_id direct)
```

Phase 2 additions (`db/migrations/0002_phase2.sql`):

- `activity_events` — persistent feed for the dashboard and portal detail.
- `onboarding_tasks.response_text` — questionnaire answers.
- `deliverables.revision_count` — revision history counter.
- `credential_vault` rebuilt with `task_id` and `wiped_at`; the CHECK allows an
  empty ciphertext only when `wiped_at` is set.

Phase 4 (`db/migrations/0003_phase4.sql`):

- `setup_requests` — concierge orders with JSON migration links, cents amount and
  status.
- `plan_limits` prices updated to $49 / $129 (limits themselves unchanged).

Migrations are tracked in `schema_migrations`, so `npm run db:apply` is
idempotent. See [`db/README.md`](db/README.md) for tenancy, indexes and the
credential threat model.

## Security model

- **Magic token is the identity.** 192 bits, unique, `noindex`, `no-referrer`.
  Client actions resolve the portal *from the token*; a portal id taken from the
  URL is never trusted.
- **Credentials**: AES-256-GCM with a per-secret IV. Reveal is a single statement
  that stamps `viewed_at`/`wiped_at` and blanks `encrypted_secret`; there is no
  path back to plaintext.
- **No RLS on Turso** — every read/write is workspace-scoped by join or direct
  `workspace_id`; see the invariants in `db/README.md`.
- **Uploads** are size-capped at 8 MB in the action and written outside the repo’s
  data folder. On serverless hosts, swap this for object storage.

## Verification

- `npx tsc --noEmit` — clean.
- `npm run build` — clean, including `/embed/wall/[workspace_slug]`,
  `/dashboard/testimonials`, `/dashboard/setup`, `/api/agents/*` and
  `/room/[magic_token]`.
- Plan enforcement tested end-to-end: switch to Solo Pro → `plan_tier='solo_pro'`,
  toggle branding → `remove_branding=1` and the room HTML no longer contains the
  badge; downgrade → `plan_tier='free'`, `remove_branding=0`, badge returns.
- Concierge intake tested through the browser: 3 migration links → one
  `setup_requests` row, `amount_cents=49900`, `status='paid'`, links stored as JSON.
- Agent fallback verified with no LLM key: budget `$24,000` → `2400000` cents,
  5 scope items, 3 credential requests, 2 file/questionnaire tasks, 4 board cards.
- Earlier phases re-verified: sign → pay → checklist → credential save → reveal →
  approve → publish testimonial, plus chaser preview → dispatch.

## Known limits (phase 5)

- Plan changes are local and simulated — no Stripe subscription, customer portal or
  proration yet. The UI is honest about this.
- The Wall of Love is public by design; external video links (Vimeo) open in a new
  tab, while locally uploaded videos play inline.
- Chaser dispatch and concierge orders update state and activity but do **not**
  send email/WhatsApp — wire an ESP/provider next.
- Single workspace; no auth or team membership. Agent routes are unauthenticated
  and should be put behind the session before deploy.
- Video testimonials write to local disk (fine for dev, not for serverless).
- Model-written output was code-complete but exercised only against the local
  fallback, because no provider key is configured in this environment.
