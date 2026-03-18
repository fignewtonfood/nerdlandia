# Nerdlandia — nerdlandia.org

The most gloriously nerdy scavenger hunt on the internet.

---

## Project Structure

```
nerdlandia/
├── index.html
├── netlify.toml
├── README.md
├── css/
│   ├── style.css          ← Global styles
│   ├── events.css         ← Events page styles
│   └── profile.css        ← Profile, forms, modals
├── js/
│   ├── auth.js            ← Supabase auth + session helpers
│   ├── teams.js           ← Team create/invite/remove logic
│   └── main.js            ← Nav, animations
├── pages/
│   ├── events.html
│   ├── login.html
│   ├── register.html
│   ├── profile.html       ← Logged-in user dashboard
│   ├── create-team.html
│   ├── accept-invite.html ← Linked from invite emails
│   ├── teams.html         ← (placeholder)
│   ├── achievements.html  ← (placeholder)
│   ├── leaderboard.html   ← (placeholder)
│   ├── marketplace.html   ← (placeholder)
│   ├── about.html         ← (placeholder)
│   └── contact.html       ← (placeholder)
└── sql/
    ├── 01_schema.sql      ← All tables, triggers, RLS policies
    ├── 02_noun_list.sql   ← Approved nouns for team names
    └── 03_storage.sql     ← Storage buckets for photos
```

---

## Step 1: Set Up Supabase

### Create a project
Go to https://supabase.com, sign in, click New Project.
Name it nerdlandia, pick a region, set a DB password. Wait ~2 min.

### Run the SQL files
Go to SQL Editor in the sidebar, click New Query, paste and run each file in order:
1. sql/01_schema.sql
2. sql/02_noun_list.sql
3. sql/03_storage.sql

### Configure Auth
Go to Authentication > URL Configuration:
- Site URL: https://nerdlandia.org
- Redirect URLs: add https://nerdlandia.org/pages/accept-invite.html

### Get your API credentials
Go to Project Settings > API.
Copy your Project URL and anon public key.

### Add credentials to the site
Open js/auth.js and replace the two placeholder values at the top:

    const SUPABASE_URL = 'https://yourproject.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJ...your-anon-key...';

---

## Step 2: Set Up Invite Emails

When a team lead invites someone, a token is saved to the database.
The send-invite Edge Function sends the email automatically.

### 2a. Get a Resend account
Go to https://resend.com and create a free account.
Free tier: 3,000 emails/month — plenty to start.
Copy your API key from the Resend dashboard.

### 2b. Verify your domain in Resend
In Resend → Domains → Add Domain → enter nerdlandia.org
Resend will give you DNS records to add in GoDaddy (TXT + CNAME).
After adding them, click Verify. Takes a few minutes.
Until verified, Resend can only send to your own email address.

### 2c. Deploy the Edge Function

Install the Supabase CLI:
    npm install -g supabase

Log in and link to your project:
    supabase login
    supabase link --project-ref YOUR_PROJECT_REF

(Find YOUR_PROJECT_REF in Supabase Dashboard → Project Settings → General)

Deploy the function:
    supabase functions deploy send-invite --project-ref YOUR_PROJECT_REF

### 2d. Set environment variables
In Supabase Dashboard → Edge Functions → send-invite → Secrets, add:

    RESEND_API_KEY       your-resend-api-key
    SITE_URL             https://nerdlandia.org

(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically)

### 2e. Create the Database Webhook
In Supabase Dashboard → Database → Webhooks → Create a new hook:

    Name:      send-invite-email
    Table:     public.team_invites
    Events:    INSERT
    Type:      Supabase Edge Functions
    Function:  send-invite

Save it. Every new invite now triggers an email automatically.

---

## Step 3: Deploy to Netlify

Drag and drop the nerdlandia/ folder at https://app.netlify.com > Add new site > Deploy manually.

Or connect a GitHub repo for automatic deploys on every push.

Then go to Site settings > Domain management > Add custom domain > nerdlandia.org.
Update GoDaddy DNS as described in the main setup conversation.

---

## Step 4: Create Your Admin Account

The FIRST account created on the live site automatically gets admin role.
Register at https://nerdlandia.org/pages/register.html before sharing the site with anyone.

Admin-only powers:
- Grant or revoke admin on any account
- Change team names (only admins can do this once set)
- Edit any user or team field
- Remove any team member

---

## Managing the Noun List

To add words (run in Supabase SQL Editor):
    insert into public.noun_list (word) values ('Ninjas'), ('Astronauts');

To remove a word:
    delete from public.noun_list where word = 'Ninjas';

---

## Design System

Fonts: Fredoka One (headings) + Nunito (body)

Colors:
- coral  #D85A30  primary CTA, errors
- blue   #185FA5  links, info
- purple #3C3489  section headings
- amber  #854F0B  hero bg, nav hover
- green  #3B6D11  success, open states
