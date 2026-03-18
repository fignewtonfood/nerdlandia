-- ─────────────────────────────────────────────────────────────
--  Nerdlandia — Database Webhook for Invite Emails
--  sql/04_invite_webhook.sql
--
--  Run this AFTER deploying the send-invite Edge Function.
--
--  What this does:
--    Whenever a new row is inserted into team_invites,
--    Supabase calls the send-invite Edge Function with the row data.
--
--  NOTE: As of 2024, Supabase Database Webhooks are configured in the
--  Dashboard UI, not via SQL. This file documents what to set up.
--  See the README for step-by-step instructions.
-- ─────────────────────────────────────────────────────────────

-- ── OPTION A: Dashboard Webhook (recommended, no SQL needed) ──
--
-- Go to: Supabase Dashboard → Database → Webhooks → Create a new hook
--
-- Settings:
--   Name:        send-invite-email
--   Table:       public.team_invites
--   Events:      INSERT
--   Type:        Supabase Edge Functions
--   Function:    send-invite
--   HTTP Method: POST
--
-- That's it. Supabase will call your Edge Function with the full
-- row payload every time a new invite is created.


-- ── OPTION B: pg_net HTTP call from a trigger (advanced) ──────
--
-- If you prefer to do it all in SQL using pg_net:
-- (pg_net is enabled by default on Supabase)

/*
create or replace function public.notify_invite_edge_function()
returns trigger language plpgsql security definer as $$
begin
  perform net.http_post(
    url     := current_setting('app.edge_function_url') || '/send-invite',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := jsonb_build_object(
      'type',   'INSERT',
      'record', row_to_json(NEW)
    )
  );
  return NEW;
end;
$$;

create trigger on_team_invite_created
  after insert on public.team_invites
  for each row execute procedure public.notify_invite_edge_function();
*/

-- ── RESEND DOMAIN VERIFICATION ────────────────────────────────
--
-- Before emails will send from hunt@nerdlandia.org you must:
-- 1. Go to https://resend.com → Domains → Add Domain
-- 2. Enter: nerdlandia.org
-- 3. Add the DNS records Resend gives you in GoDaddy
--    (usually 1 TXT record for SPF + 1 CNAME for DKIM)
-- 4. Click Verify — takes a few minutes
--
-- Until the domain is verified, Resend will only send to
-- your own Resend account email (useful for testing).
