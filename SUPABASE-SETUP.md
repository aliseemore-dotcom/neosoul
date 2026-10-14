# Switching from prototype to real accounts

Right now accounts live in the browser. Everything below moves them to Supabase
without changing a single screen.

## 1. Create the project

supabase.com → new project → free tier is enough to start.
Copy **Project URL** and **anon public key** from Settings → API.

## 2. Paste two values

`neosoul.js`, top of the file:

```js
const SUPABASE_URL      = 'https://xxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJ...';
```

The anon key is meant to be public. Security comes from the policies below,
not from hiding it. The **service_role** key must never appear in the browser.

## 3. Create the tables

Run in the Supabase SQL editor:

```sql
create table daily_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  entry_date   date not null,
  mood         smallint check (mood between 1 and 5),
  energy       smallint check (energy between 1 and 5),
  journal_text text,
  updated_at   timestamptz not null default now(),
  unique (user_id, entry_date)          -- one entry per day, structurally
);

create table app_docs (                 -- profile, memories, guidance, reflections
  user_id uuid not null references auth.users on delete cascade,
  key     text not null,
  value   jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table daily_entries enable row level security;
alter table app_docs      enable row level security;

create policy own_entries on daily_entries for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_docs on app_docs for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Row Level Security is what makes one person's diary unreadable to everyone else,
including a bug in the front end.

## 4. Email confirmation

Authentication → Providers → Email. Decide whether to require confirmation.
If yes, the user lands on the journal only after clicking the link, so
`join.html` should say so. If no, they go straight through — faster, slightly
weaker against fake signups.

## 5. Still to do before charging anyone

- **Stripe.** The paywall button currently only explains itself. Subscriptions
  need Stripe Checkout plus a webhook that writes the plan back to the user.
  A webhook is server code — a Supabase Edge Function is the smallest option.
- **Privacy policy and terms.** The links on `join.html` go nowhere. You cannot
  lawfully collect accounts, let alone diary entries, without them.
- **Export and delete.** A user must be able to take their diary and to remove
  it completely.
