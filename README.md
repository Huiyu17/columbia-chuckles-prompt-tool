# Columbia Chuckles · Prompt Chain Tool

Week 8's independent Next.js application. Shares the existing Supabase project
with the public site and Admin; it is deployed as its own GitHub/Vercel project.

## Local development

1. `npm ci` (Node 20.9+).
2. Copy `.env.example` to `.env.local`. Use the same Supabase URL/anon key as the
   other apps, plus server-only `GEMINI_API_KEY`. Never commit credentials.
3. After the existing 008–014 migrations, apply 015 through 019 in order to
   the shared project. Apply only migrations not already applied.
   Do not rerun older migrations after 019; see `MULTISTEP_SETUP.md`.
   Copies of 008/012/013 are local test fixtures, not a new database bootstrap.
4. Add `http://localhost:3002/auth/callback` to Supabase auth redirect URLs.
5. `npm run dev` → http://localhost:3002.

Google login uses the existing `profiles.is_superadmin` permission. Proxy, pages,
every Server Action and each database RPC check access. No service role is used.
Anonymous and ordinary users cannot read or mutate tool data.

## Build and run

Create/edit/delete prompt chains and their steps; move steps up/down, then save.
The entire ordered configuration saves transactionally with revision checks.
Errors preserve edits. New chains are excluded from the public app's mix.
After migration 017, new chains receive disabled Admin mix settings automatically.
The upgraded public engine runs all 1–6 steps in saved order. Active chains may be
edited; existing runs retain their configuration snapshots. Disable a live chain
in Admin before deleting it. See `MULTISTEP_SETUP.md` for the three-app rollout.

Choose a photo and scene, then Generate media. There are 1–6 **real sequential
Google model calls**, one per step. Step 1 receives the photo (for Storage-backed
images), description and scene. Sample photos without a storage path use their
description, explicitly indicated beside the selection. Each later step receives
the immediately preceding output. Select named registered Google models or the
registered environment default. Other providers are not implemented.

The final output is generated text/captions, paired with the source image; this
tool does not synthesize new raster images or automatically publish public captions.
Generated media includes tool runs and existing public-app request outputs, filtered
by exact chain internally. Step results show real output, instructions, duration
and token counts. Missing usage stays unavailable. No demonstration runs are seeded.

Configuration snapshots and intermediate outputs persist before continuing.
Failures stop subsequent calls. Interruption can leave an in-progress run; a new
attempt after five minutes marks abandoned runs failed. One active run per admin
prevents accidental concurrent calls. Deleting chain configuration preserves tool
media and original public requests/responses, detaching configuration references.
Run history is read-only. Appearance offers light, dark and system mode, follows
system changes, and persists the chosen preference.

## Verification

For execution details on public-app media, apply
`supabase/016_media_execution_details.sql` after 015. This updates only the
superadmin media query and exposes saved prompts, responses, errors, model names,
durations and token usage. Historical missing values remain unavailable.
The gallery shows both sources in a collapsed Execution details section.

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
`node scripts/browser-test.mjs` runs the real React editor in Chromium (requires
Playwright/Chromium, or the available Codex runtime browser dependencies).

Database tests use PGlite with minimal shared schema fixtures; they do not contact
Supabase. Pipeline tests simulate provider responses and verify sequential data
flow, failures and persistence. OAuth, paid Google calls and production CRUD need
separate real-environment checks.

## Deployment and submission

Create a separate GitHub repository and Vercel project for this app. Set the
three environment variables above (plus optional `GEMINI_MODEL`), apply 015,
and allow the production and submitted deployment `/auth/callback` URLs in Supabase.
Disable Vercel Deployment Protection for submitted deployments; retain app login.
The route uses a 300-second function budget and a 30-second timeout per model call.
Verify your Vercel plan permits that budget.

Submit the **latest commit-specific deployment URL for each of the three apps**:
public app, Admin and Prompt Chain Tool. Check each in Incognito, Google sign-in,
ordinary-user denial, admin CRUD/reorder, an actual three-step generation, filtered
media and all three appearance modes. A successful local build does not establish
production acceptance or that the shared migration has been applied.
