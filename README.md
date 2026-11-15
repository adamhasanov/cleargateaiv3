# ClearGateAI — MVP prototype

*Catch the error before it costs you.*

ClearGateAI checks customs trade documents **before submission**. The user uploads an invoice, a packing list and a customs document. AI reads each document and extracts weight, quantity, price and HS code. A **deterministic rule engine** compares the values. The user then sees the mismatches, a plain-language explanation and a suggested fix for each one. The user decides, corrects and submits **outside** the product.

> Status: MVP prototype, validation stage. Not validated with users. Extraction accuracy on real documents has not been measured.
> Product documentation (PRD, MVP scope, user flows, functional requirements, architecture, test plan) is kept by the team outside this repository.

## Stack

- Next.js (App Router) + TypeScript, deployable on Vercel
- Plain CSS design system (`src/app/globals.css`), no UI framework
- Google Gemini (`@google/genai`, default, free AI Studio key) or Anthropic (`@anthropic-ai/sdk`) for document extraction, validated with `zod` (server-side only)
- Vitest for the rule-engine tests

## Project structure

| Path | Responsibility (SYSTEM_ARCHITECTURE module) |
|---|---|
| `src/app/[lang]/page.tsx` | Landing page (AZ / RU / EN) |
| `src/app/[lang]/check/page.tsx` + `src/components/check/` | Upload → processing → results flow (M-01, M-03) |
| `src/lib/config/documents.ts` | Accepted formats, size limit, field coverage — **all decision-dependent values in one place** (M-02) |
| `src/app/api/extract/route.ts` | Receives one document in memory, calls the extraction provider, returns the outcome |
| `src/lib/extraction/` | Extraction provider interface, Anthropic adapter, outcome mapping (AI extraction component, M-04) |
| `src/lib/engine/` | Deterministic rule engine + tests (no AI call) |
| `src/lib/explain.ts` | Template-based explanation and suggested fix (M-05) |
| `src/i18n/` | Dictionaries (`az` is the default and the source) and locale handling (M-07) |
| `src/lib/engine/risk.ts` | Shipment Risk Score — deterministic rules, documented in the file, unit-tested |
| `src/lib/server/` | HTTP helpers (same-origin check) and an in-memory rate limiter. No database, no accounts |
| `src/lib/client/demo.ts` | Browser-only demo store: fake sign-in, simulated plan, check history and advisor chats in localStorage |
| `src/lib/billing/plans.ts` | Static plan catalogue (simulated plans, no payments) |
| `src/lib/ai/` | Advisor chat provider and system prompt |
| `src/app/api/` | `extract` and `advisor` — both stateless |
| `src/components/portal/` | Fake sign-in/sign-up pages, dashboard, plans, account, saved check + report, advisor |

## MVP demo: no database, no real accounts

This is an MVP simulation. **Sign in and sign up are fake**: any e-mail and password are accepted, nothing is verified, and no user data is sent to or stored on a server or in a database. The "account" (name, simulated plan, check history, advisor chats) lives only in this browser’s localStorage and can be erased from the Account page.

| Feature | Status |
|---|---|
| Fake sign-in / sign-up and a one-click "Try without signing up" guest button | Simulated, browser only |
| Plans Free (1 check in total) / Starter (3 AZN per document) / Premium (60 AZN month, 300 AZN year) / VIP (60 AZN month, 600 AZN year) | Simulated: choosing a plan only changes the limit in this browser, nothing is charged |
| Document extraction (pre-AI masking, then AI) and the rule-engine comparison | Real |
| Shipment Risk Score 0–100 (Low/Medium/High) with reasons | Real, deterministic |
| AI Customs Advisor (az/ru/en) | Real AI; stateless: the browser sends the conversation and the extracted values, the server stores nothing |
| Abuse protection | In-memory per-IP rate limits on `/api/extract` and `/api/advisor` (best effort) |

**Shipment Risk Score** (`risk-1`): higher = more problems found in the documents. Mismatch HS code 30 / weight, quantity, price 20 each (+0/+5/+10 for minor/moderate/major spread: <2 %, ≥2 %, ≥10 %); unreadable document +15; field present in fewer than two documents +10; uncertain values (units, gross/net, unreadable number) +8; missing value +5 per document. Capped at 100. Low 0–24, Medium 25–59, High 60–100. It is not an official customs risk assessment, and the AI never sets the number.

**Privacy**: uploaded files are never stored. A saved check holds only the values read from each document and the file names, in the browser. Because there is no server-side account, the demo history is not shared between devices.

## Local development

Requires Node.js 20 or newer. Dependency versions are pinned in `package.json`.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Set `GEMINI_API_KEY` in `.env.local` (free key: https://aistudio.google.com/apikey). Without it the app still runs, but the upload page says that extraction is not configured and no check can start. Nothing is simulated.

```bash
npm run dev
```

## Try sample documents (DP-10)

The check page has a **Try sample documents** section with four fictional scenarios. "Use sample" loads the scenario's three PDFs from `public/samples/<scenario>/` into the upload slots; the user then starts the normal check (masking → AI reading → rule engine). Nothing is precomputed. Each check counts against the plan like any other.

| Scenario | What it shows | Result (verified live) |
|---|---|---|
| `clean` | All four fields agree | No mismatch · risk 0 |
| `quantity-weight` | Packing list 1,200 kg / 38 cartons vs 1,250 kg / 40 cartons | Weight + quantity mismatch · risk 50 |
| `hs-code` | Customs document HS `0000.10` vs `0000.00` | HS code mismatch · risk 30 |
| `missing-info` | No HS code on the packing list, no value on the customs document | Incomplete · risk 10 |

The documents carry fictional party details (names, VÖEN, IBAN, SWIFT, phones, e-mails, contacts) so masking can be seen and tested. HS codes are placeholders, not real classifications. Values live in `samples/sample-sets.json`; regenerate the PDFs with:

```bash
npm run samples
```

## Privacy: masking before any AI call (F9b)

Documents are **never sent to an AI provider**. For every uploaded document the server:

1. extracts the text locally: the PDF text layer with pdf.js (lines and columns rebuilt), or **local OCR** (Tesseract, az + ru + en) for JPG/PNG scans;
2. masks it (`src/lib/privacy/mask.ts`): company names (legal forms such as Ltd, LLC, MMC, ASC, OJSC, ООО, АО, including quoted forms), the lines under Seller / Buyer / Consignor / Consignee / Declarant headings (AZ/RU/EN), labelled tax IDs (VÖEN, TIN, ИНН, VAT), IBANs, bank accounts, SWIFT/BIC, card numbers (Luhn-checked), e-mails, phones, contact persons, bank names and addresses;
3. runs a fail-closed check: if anything still looks like an IBAN, e-mail, labelled tax ID, SWIFT or card number, **nothing is sent**;
4. sends only the masked text. `ExtractionInput` has no field for a file or unmasked text.

Weights, quantities, amounts, HS codes and document numbers are kept. No placeholder→original mapping is created: the check only needs the business fields, so nothing has to be restored. Logs contain error codes only. A PDF without a text layer (a scan saved as PDF) is refused with a request to upload the pages as images, because it cannot be masked without rendering pages.

Verified by tests: `src/lib/privacy/mask.test.ts` (all 12 sample PDFs, rule cases in AZ/RU/EN, OCR of a scanned image, refusal of an image-only PDF) and `src/lib/privacy/outgoing-request.test.ts` (records the real Gemini provider's HTTP requests for all 12 sample PDFs: no file, no sensitive value).

**Limitations:** masking is rule-based. A name with no label, no legal form and not under a party heading, an ID printed without its label, or text garbled by OCR can be missed. A scanned PDF must be uploaded as page images (one image per document slot). Tesseract's language data is downloaded once from the tessdata CDN (no document content is sent) unless `TESSDATA_LANG_PATH` points to a local copy.

Checks:

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run build
```

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | Yes, for live checks | Free Google AI Studio key for document extraction. Server-side only, never sent to the browser. |
| `CLEARGATE_EXTRACTION_PROVIDER` | No | `gemini` (default) or `anthropic`. |
| `ANTHROPIC_API_KEY` | Only with `anthropic` | Key for the Anthropic provider. |
| `CLEARGATE_EXTRACTION_MODEL` | No | Model override. Defaults: `gemini-3.8-flash` / `claude-opus-5-5`. |
| `NEXT_PUBLIC_HERO_VIDEO_URL` | No | URL of a muted, looping harbor video for the hero. If empty, the slowly drifting still image is used. |
| `NEXT_PUBLIC_ENABLE_SAMPLE_DEMO` | No | `true` shows a "sample result" button that runs the rule engine on **prepared, labelled sample values**. Off by default. |

`NEXT_PUBLIC_*` values are compiled into the client bundle at build time. Redeploy after changing them.

## Deploying to Vercel

1. Import the GitHub repository in Vercel. The framework is detected as **Next.js**. Keep the default build command (`next build`) and output settings.
2. In **Project → Settings → Environment Variables**, add `GEMINI_API_KEY` (Production, and Preview if wanted). Add the optional variables above if needed.
3. Deploy. `/` redirects to `/az`. The API route `/api/extract` runs on the Node.js runtime with `maxDuration = 60` s.
4. Vercel limits a function request body to 4.5 MB, so uploads are capped at 4 MB per document.

## Hero background asset

The hero image is stored as base64 text in `assets/hero-harbor.webp.b64` and restored to `public/media/hero-harbor.webp` by `scripts/decode-assets.mjs` before `dev` and `build` (the repository was populated through a text-only API). It is cropped from the design reference and is low resolution. To replace it, put the original high-resolution image at `public/media/hero-harbor.webp`, remove the asset entry from the script and from `.gitignore`, and commit the image. To use a video, host an MP4/WebM and set `NEXT_PUBLIC_HERO_VIDEO_URL`. With `prefers-reduced-motion` enabled, no video or motion is shown.

## Privacy note on the free Gemini tier

On Google's free tier, submitted content may be used by Google to improve its products. Masking is not implemented yet, so use **only fictional sample documents** with a free key.

## Product rules the code enforces

- AI only reads and extracts. Matching is decided by fixed rules (`src/lib/engine/compare.ts`). Same extracted input → same result.
- Exact comparison, no tolerance (DEC-07 open). No unit or currency conversion (RG-01 open): different units are shown as "not compared".
- A missing or unreadable value is never treated as a match. A result with missing data is never shown as clean.
- No submit function, no document editing, no accounts, no history, no storage. Files live in browser memory and in the memory of one API request only.
- No risk score, no official HS code check and no masking. These are shown on the landing page as **planned**.
- No accuracy, speed, efficiency, zero-retention or customs-acceptance claims anywhere in the UI.

## Working assumptions pending team decisions

| Decision | Working choice in code | Where to change |
|---|---|---|
| DEC-01 formats | PDF, JPG, PNG (from the design reference), max 4 MB (platform limit) | `src/lib/config/documents.ts` |
| DEC-02 customs document | Generic "customs document" | dictionaries |
| DEC-03 extraction | Google Gemini (free tier) with JSON-schema output, checked with zod; Anthropic available as an alternative | `src/lib/extraction/` |
| DEC-04 field coverage | Every field expected in every document | `FIELD_COVERAGE` |
| DEC-07 tolerance | None (exact) | `src/lib/engine/compare.ts` |
| DEC-10 language | AZ default + RU + EN (owner request) | `src/i18n/` |
| DEC-11 explanations | Fixed templates, no AI | `src/lib/explain.ts` |
| DEC-12 unreadable docs | Result shown as incomplete; failed extraction shows no result | `CheckFlow.tsx` |
| DEC-14 clean result | Minimal "no mismatch in compared fields" with no-guarantee text | dictionaries |
| RG-01 extraction basis | Gross weight if printed (else net), document total quantity and total amount | `src/lib/extraction/anthropic.ts` |
# ClearGate
