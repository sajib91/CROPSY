# AI Agricultural Assistant

The authenticated assistant is available at `/en/ai-assistant` and `/bn/ai-assistant`. It is a
conversational workspace for advisory agricultural questions, follow-up questions, image analysis,
and document indexing. It is intentionally separated from the public
`/en/agricultural-intelligence` and `/bn/agricultural-intelligence` marketing pages.

## Data boundary

The browser never calls the FastAPI service. Every request goes to the same-origin Next.js route
`/api/dashboard/[...path]`, which forwards to the authenticated Fastify API. Fastify validates the
body, checks the session permission, then signs a request to the internal AI service with HMAC and
trusted organization/user headers. No AI URL, shared secret, tenant identifier, or user identifier
is exposed to the browser, and no token is stored in `localStorage` or `sessionStorage`.

Permissions:

| Action | Permission |
| --- | --- |
| Chat, conversation list/history, capabilities, image analysis, document indexing | `ai.read` |
| Answer feedback and image-analysis feedback | `ai.feedback` |

The UI fails closed with `canAccess(session, ...)`. A session without `ai.read` sees an access
empty state; feedback controls are hidden when `ai.feedback` is absent.

## Web-to-AI endpoint map

| Web action | Dashboard proxy path | Fastify route | AI internal route |
| --- | --- | --- | --- |
| Capabilities | `GET /api/dashboard/intelligence/ai/capabilities` | `GET /api/v1/intelligence/ai/capabilities` | `GET /api/v1/internal/capabilities` |
| List conversations | `GET .../intelligence/ai/conversations` | `GET .../ai/conversations` | `GET /api/v1/internal/conversations` |
| Open conversation | `GET .../intelligence/ai/conversations/:id` | `GET .../ai/conversations/:id` | `GET /api/v1/internal/conversations/:id` |
| Send chat turn | `POST .../intelligence/ai/chat` | `POST .../ai/chat` | `POST /api/v1/internal/assistant/chat` |
| Submit chat feedback | `POST .../intelligence/ai/feedback` | `POST .../ai/feedback` | `POST /api/v1/internal/feedback` |
| Analyze image | `POST .../intelligence/ai/image-analysis/analyze` | `POST .../ai/image-analysis/analyze` | `POST /api/v1/internal/image-analysis/analyze` |
| Submit image feedback | `POST .../intelligence/ai/image-analysis/feedback` | `POST .../ai/image-analysis/feedback` | `POST /api/v1/internal/image-analysis/feedback` |
| Index document | `POST .../intelligence/ai/multimodal/assets` | `POST .../ai/multimodal/assets` | `POST /api/v1/internal/multimodal/assets` |

The dashboard proxy allows only the write paths above for the intelligence module; all other
`POST`/`PATCH`/`DELETE` paths remain rejected before reaching the API. JSON is used for uploads:
files are converted to base64 in the browser and validated again by the Fastify DTO and the AI
service. `proxyApiRequest` is not binary-safe, so multipart uploads are deliberately not used.

## Rendered fields

Answers, sources, and execution metadata are rendered only when returned by the API:

- Chat: `status`, `answer`, `isFollowUp`, `advisory`, `model`, `provider`, `detectedLanguage`,
  `intent`, `traceId`, `facts[]`, `predictions[]`, `citations[]`, `evidence[]`, `uncertainties[]`,
  `safetyNotes[]`, `limitations[]`, `retrieval`, and `citationValidation`.
- Citations: `title`, `section`, `excerpt`, `sourceName`, `sourceUrl`, `publisher`, `publishedAt`,
  `jurisdiction`, `licenseCode`, `score`. A link is rendered only for an `http(s)` `sourceUrl`.
- Image analysis: `status`, `explanation.summary`, `prediction.observations`, `prediction.candidates`,
  `confidence`, `confidenceBasis`, `uncertainty`, `references[]`, `limitations[]`, and `nextSteps[]`.
- Document indexing: `assetId`, `assetKind`, `status`, `chunkCount`, `citationEligible`, and
  `citationEligibilityReason`.

Unsupported states are explicit: no answer fallback text, no invented citations, no guessed model
or provider, no synthetic confidence value, and no success message until the feedback POST succeeds.
When the AI gateway is unconfigured, Fastify returns `503 ai_service_unavailable`; the UI shows that
API message in an error state. A chat error keeps the user's own message but never inserts an
assistant reply.

## Conversation behavior

The AI service owns conversation storage (in-memory by default, bounded and time-limited). The first
chat turn may omit `conversationId`; the API response supplies one and the workspace refreshes the
conversation list from the API. Selecting a saved conversation loads it through the API and renders
only stored `messages[]` fields. "New conversation" clears local state; it does not create a fake
server record.

Conversation language is sent as `en`, `bn`, or `both`, with the localized route selecting the
initial value. `isFollowUp` is displayed as a status badge because the service reports it; the UI
does not invent suggested follow-up questions.

## Upload rules

- Image analysis accepts JPEG, PNG, and WebP up to 5 MB. The composer optionally sends the current
  draft as the analysis question, plus the selected subject type and analysis focus.
- Document indexing accepts PDF and text formats up to 5 MB. Text files are sent as `text`; PDFs are
  sent as `contentBase64`.
- User uploads are submitted as `status: UNVERIFIED`. The strict gateway requires a license object,
  so the UI sends the explicit sentinel `UNSPECIFIED` / `urn:cropsy:license:unspecified` with
  `verified: false`. This is not a claim of a real license and is never presented as citation
  permission. Only `citationEligible` from the API determines the displayed eligibility badge.
- Image observations are advisory and never labelled a diagnosis. `confidence` is shown only when
  the API returns a number, together with the returned `confidenceBasis`.

## Localization and verification

`apps/web/lib/i18n/en.js` and `bn.js` contain identical `pages.aiAssistant` and `assistantUi` leaf
keys. Page metadata uses `createLocalizedPageMetadata(locale, 'aiAssistant', '/ai-assistant')`.

Run from the repository root:

```bash
npm run check:i18n
npm run lint
npm run format:check
npm run build
npm run verify
```

The API contract tests cover the conversation-list operation, strict gateway operations, and
unconfigured-gateway failure behavior.
