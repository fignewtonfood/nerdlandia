// ─────────────────────────────────────────────────────────────
//  Nerdlandia — send-invite Edge Function
//  supabase/functions/send-invite/index.ts
//
//  Triggered by a Supabase Database Webhook on:
//    Table: public.team_invites
//    Event: INSERT
//
//  Required environment variable (set in Supabase Dashboard):
//    RESEND_API_KEY   — from https://resend.com
//    SITE_URL         — e.g. https://nerdlandia.org
// ─────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SITE_URL       = Deno.env.get("SITE_URL") ?? "https://nerdlandia.org";
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Admin Supabase client (bypasses RLS — safe inside an Edge Function)
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req: Request) => {
  // Supabase webhooks send a POST with the row as JSON
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let payload: { record?: InviteRecord; type?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Only act on INSERT events with a pending invite
  if (payload.type !== "INSERT" || !payload.record) {
    return new Response("Ignored", { status: 200 });
  }

  const invite = payload.record;
  if (invite.status !== "pending") {
    return new Response("Not a pending invite", { status: 200 });
  }

  // Fetch team name and inviter username
  const [{ data: team }, { data: inviter }] = await Promise.all([
    sb.from("teams").select("name").eq("id", invite.team_id).single(),
    sb.from("profiles").select("username, email").eq("id", invite.invited_by).single(),
  ]);

  const teamName    = team?.name ?? "a Nerdlandia team";
  const inviterName = inviter?.username ?? inviter?.email ?? "your team lead";
  const acceptUrl   = `${SITE_URL}/pages/accept-invite.html?token=${invite.token}`;

  // Send email via Resend
  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Nerdlandia <hunt@nerdlandia.org>",
      to: [invite.email],
      subject: `🗺 You've been invited to join ${teamName} on Nerdlandia!`,
      html: buildEmailHtml({ teamName, inviterName, acceptUrl, inviteEmail: invite.email }),
      text: buildEmailText({ teamName, inviterName, acceptUrl }),
    }),
  });

  if (!emailRes.ok) {
    const err = await emailRes.text();
    console.error("Resend error:", err);
    return new Response("Email send failed: " + err, { status: 500 });
  }

  console.log(`Invite email sent to ${invite.email} for team ${teamName}`);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

// ── EMAIL TEMPLATES ──────────────────────────────────────────

interface InviteRecord {
  id: string;
  team_id: string;
  email: string;
  token: string;
  status: string;
  invited_by: string;
  created_at: string;
}

interface EmailParams {
  teamName: string;
  inviterName: string;
  acceptUrl: string;
  inviteEmail?: string;
}

function buildEmailHtml({ teamName, inviterName, acceptUrl }: EmailParams): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You've been invited to ${teamName}!</title>
</head>
<body style="margin:0;padding:0;background:#FFF8E7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8E7;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:2px solid #FAC775;overflow:hidden;max-width:560px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#FAEEDA;padding:28px 40px 24px;text-align:center;border-bottom:2px solid #FAC775;">
              <p style="margin:0 0 6px;font-size:2rem;">🗺</p>
              <p style="margin:0;font-size:1.5rem;font-weight:800;color:#D85A30;letter-spacing:-0.5px;">Nerdlandia</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 28px;">
              <h1 style="margin:0 0 12px;font-size:1.4rem;font-weight:800;color:#2C2C2A;">
                You've been invited to join <span style="color:#185FA5;">${escapeHtml(teamName)}</span>! 🎉
              </h1>
              <p style="margin:0 0 20px;font-size:1rem;color:#5F5E5A;line-height:1.6;">
                <strong>${escapeHtml(inviterName)}</strong> has invited you to join their scavenger hunt team
                on Nerdlandia. Click the button below to accept and become part of the crew.
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:28px 0;">
                <tr>
                  <td style="background:#D85A30;border-radius:50px;padding:0;">
                    <a href="${acceptUrl}"
                       style="display:inline-block;padding:14px 32px;font-size:1rem;font-weight:800;color:#ffffff;text-decoration:none;border-radius:50px;">
                      Accept Invite →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:0.82rem;color:#888780;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 24px;font-size:0.78rem;color:#185FA5;word-break:break-all;">
                ${acceptUrl}
              </p>

              <hr style="border:none;border-top:1px solid #F1EFE8;margin:0 0 20px;" />

              <p style="margin:0;font-size:0.82rem;color:#888780;line-height:1.5;">
                If you weren't expecting this invite, you can safely ignore this email.
                This invite will expire if the team fills up before you accept.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#F8F6F0;padding:16px 40px;text-align:center;border-top:1px solid #F1EFE8;">
              <p style="margin:0;font-size:0.78rem;color:#888780;">
                © 2025 Nerdlandia · nerdlandia.org · Made with 🧠 and caffeine
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildEmailText({ teamName, inviterName, acceptUrl }: EmailParams): string {
  return `You've been invited to join ${teamName} on Nerdlandia!

${inviterName} has invited you to join their scavenger hunt team.

Accept your invite here:
${acceptUrl}

If you weren't expecting this, you can safely ignore this email.

— Nerdlandia · nerdlandia.org`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
