This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

## Opportunities and admin access

Apply [`supabase/migrations/20261024000000_opportunities_admin.sql`](./supabase/migrations/20261024000000_opportunities_admin.sql) in the Supabase SQL Editor. It creates the opportunities table, enables authenticated reads, and restricts inserts, updates, and deletes to users whose trusted `app_metadata` contains `"role": "admin"`.

Apply [`supabase/migrations/20261024000002_admin_workspace.sql`](./supabase/migrations/20261024000002_admin_workspace.sql) after the opportunities migration. It adds featured/archive publishing controls and an admin-only policy for removing Live Wall posts. Archived opportunities are hidden from students but remain available to admins for restoration.

To grant admin access, open the Supabase Authentication user for the configured admin account and set **app_metadata** to:

```json
{
  "role": "admin"
}
```

Use the admin email address configured for this deployment. Do not put the role in user-editable `user_metadata`. After changing app metadata, sign in again so the session token carries the updated role. Admin accounts are redirected directly to the admin panel after sign-in; they can also use the hidden **Admin** workspace tab. Admin actions are protected by Supabase Row Level Security as well as the UI.

## Profile customization

Apply [`supabase/migrations/20261024000001_profile_customization.sql`](./supabase/migrations/20261024000001_profile_customization.sql) in the Supabase SQL Editor to add profile bio, location, website/social links, and the public `profile-avatars` storage bucket. The bucket accepts JPG, PNG, and WebP files up to 5 MB; authenticated users can only upload or change files inside their own user-ID folder.

If an avatar upload reports that the bucket was not found, this migration has not been applied to the Supabase project configured for this app. Open the migration file, run its SQL in that project's Supabase SQL Editor, then retry the upload.

Apply [`supabase/migrations/20261025000000_tech_goals.sql`](./supabase/migrations/20261025000000_tech_goals.sql) and then [`supabase/migrations/20261025000001_momentum_features.sql`](./supabase/migrations/20261025000001_momentum_features.sql) in the Supabase SQL Editor, after the profile and opportunities migrations. The second migration moves goals into a privacy-aware table and adds profile visibility settings, opportunity bookmarks, weekly review storage, challenge participation, and private reminder preferences. It also adds row-level policies that limit private profile, activity, goal, and preference records.

Apply [`supabase/migrations/20261025000002_opportunity_sources.sql`](./supabase/migrations/20261025000002_opportunity_sources.sql) after the momentum features migration to enable the admin-only Opportunity Sources registry.

Apply [`supabase/migrations/20261025000003_opportunity_review_queue.sql`](./supabase/migrations/20261025000003_opportunity_review_queue.sql) after the opportunity sources migration. It adds a private admin review queue for feed-imported items while keeping existing opportunities published.

Apply [`supabase/migrations/20261025000004_opportunity_source_conflict_target.sql`](./supabase/migrations/20261025000004_opportunity_source_conflict_target.sql) after the review queue migration to make the source-item deduplication index usable by PostgreSQL `ON CONFLICT`.

Apply [`supabase/migrations/20261025000005_optional_opportunity_deadlines.sql`](./supabase/migrations/20261025000005_optional_opportunity_deadlines.sql) to allow opportunities without a supplied deadline. This is important for feed entries that don’t include a deadline; the importer leaves missing dates empty rather than guessing.

If PostgREST reports that `last_synced_at` is missing from `opportunity_sources`, apply [`supabase/migrations/20261025000006_opportunity_source_sync_columns.sql`](./supabase/migrations/20261025000006_opportunity_source_sync_columns.sql). It ensures the sync/test metadata columns exist and requests a schema-cache reload.

If PostgREST reports that `status` is missing from `opportunity_bookmarks`, apply [`supabase/migrations/20261025000007_opportunity_bookmark_status.sql`](./supabase/migrations/20261025000007_opportunity_bookmark_status.sql). It adds the saved/interested/applied application status and refreshes the schema cache.

If joining a challenge fails because Supabase requires `challenge_id`, apply [`supabase/migrations/20261025000008_challenge_participants_compatibility.sql`](./supabase/migrations/20261025000008_challenge_participants_compatibility.sql). It adds the current `challenge_key` column, preserves legacy rows, makes the old `challenge_id` optional, and reloads the schema cache.

Apply [`supabase/migrations/20261025000009_challenge_completion.sql`](./supabase/migrations/20261025000009_challenge_completion.sql) after challenge compatibility to let members record when they finish a joined weekly challenge. Completion is available once the challenge’s weekly progress target is met.

Apply [`supabase/migrations/20261025000010_live_wall_reactions.sql`](./supabase/migrations/20261025000010_live_wall_reactions.sql) after challenge completion to prevent each member from repeatedly high-fiving or supporting the same Live Wall update. It creates unique per-user reactions and updates the displayed totals in the database.

Apply [`supabase/migrations/20261025000011_trust_and_safety.sql`](./supabase/migrations/20261025000011_trust_and_safety.sql) after the Live Wall reactions migration. It adds listing verification dates and private, one-report-per-member workflows for Live Wall posts and opportunities. Admins can review and close reports in the Admin workspace.

Apply [`supabase/migrations/20261109000000_friends_and_messages.sql`](./supabase/migrations/20261109000000_friends_and_messages.sql) after trust and safety to add private friend requests and one-to-one messaging. Only public profiles appear in member search; only accepted friends can message each other. Supabase row-level security protects requests, conversations, and message read status.

If profile settings still report missing profile/privacy columns after the earlier profile migrations have been applied, run [`supabase/migrations/20261109000001_profile_schema_compatibility.sql`](./supabase/migrations/20261109000001_profile_schema_compatibility.sql). It idempotently ensures all profile-save columns and private reminder preferences exist, then asks PostgREST to reload its schema cache.

Apply [`supabase/migrations/20261109000002_messaging_safety_realtime.sql`](./supabase/migrations/20261109000002_messaging_safety_realtime.sql) after the friends/messages and profile compatibility migrations. It adds account blocking and friend removal, limits friend requests to 20 per member per 24 hours, enables Realtime for friend and message updates, and expands moderator reports to include conversations. The Friends tab uses Realtime when available and continues periodic refreshes as a fallback. Apply this migration in the Supabase SQL Editor before using the new controls.

For a new Supabase project, apply migrations in timestamp order: opportunities, profile customization, admin workspace, Goal Tracker storage, momentum features, opportunity sources, opportunity review queue, source conflict target, optional opportunity deadlines, source sync columns, bookmark status, challenge compatibility, challenge completion, Live Wall reactions, trust and safety, friends and messages, profile schema compatibility, then messaging safety and Realtime. The Goal Tracker storage migration creates the legacy goals column so the momentum migration can safely transfer any existing goals before removing that column.

Goal Tracker supports goal due dates, priority, progress, checklists, notes, resource links, overdue/completed filters, and completion tracking. Weekly reviews are private to each student. Community challenges are optional and refresh weekly. Opportunity bookmarks and application status are private to the signed-in student.

Browser reminders require notification permission and only run while Odyssey is open in that browser. They are local reminders, not email or push notifications.

New members see an optional onboarding checklist on the Live Wall. Opportunity listings show the last date an admin verified them; verification older than 30 days is marked due, and past deadlines are flagged. Always confirm application details on the official page. Members can report outdated listings and community posts for admin review.

Run `npm test` for opportunity freshness/deadline, reaction-gating, and challenge-progress unit tests, and `npm run lint` plus `npm run build` before deploying. The app includes a page error boundary that logs client errors to the browser console and offers a retry; configure your hosting provider's error monitoring/logging before launch for centralized production alerts. No third-party telemetry service is currently configured.

Friends and messages are available to signed-in members from the Friends tab after the corresponding Supabase migration has been applied. Friend requests must be accepted before direct messages can be sent.

## Admin workspace

The admin workspace includes platform totals, recent Live Wall moderation, profile review, opportunity featuring/archiving, and reversible account suspension. To enable account controls, configure `SUPABASE_SERVICE_ROLE_KEY` as a server-only environment variable in the deployment and local `.env.local`. Never use a `NEXT_PUBLIC_` prefix for this key or expose it to browser code. The account-management route verifies the caller's Supabase session and trusted `app_metadata.role === "admin"` before using the service key. Admins cannot suspend their own account; account deletion is intentionally not provided.

The Opportunity Sources registry is available to admins after applying the source and review-queue migrations. It stores source name, type (API, RSS/Atom, CSV, or manual), URL, verification status, last sync/test timestamps, and a publish policy. Mark a source verified only after confirming the publisher documents the endpoint and permits its use. **Test sync** makes a bounded HTTPS request and checks that the response resembles the selected format. **Sync to review** currently imports up to 50 RSS/Atom entries from verified sources as unpublished candidates, deduplicated by feed item ID; admins must edit/verify, approve, or reject each item. Nothing from a feed is visible to students until approved. Use a feed that lists actual programs, grants, or events: general education/news feeds can produce unrelated review candidates. The NASA Learning Resources feed is a broad education-news feed, not a dedicated opportunities feed, so review its entries carefully and reject unrelated articles. HTML scraping, API/CSV imports, automatic publishing, and scheduled sync are not enabled. Fetches are HTTPS-only, limited to 1 MB and eight seconds, and restricted to hosts resolving only to public IP addresses.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
