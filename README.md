# InterventionOS

Native Expo draft for intervention and coaching case management.

## Setup

The Expo scaffold command was not approved in this environment, so this local project was created manually with the EAS project id already in `app.json`.

When ready to install dependencies:

```sh
cd InterventionOS
npm install
npx eas-cli init --id e9c1db37-f9a4-4596-88b8-c99abdf9bc61
npm run start
```

## Supabase

Create a local `.env` file:

```sh
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here
```

Apply the migration in `supabase/migrations/20260627221249_interventionos_cloud_agent_schema.sql` to create the cloud-backed case tables.

The app now supports optional cloud sync:

1. Configure the Expo public Supabase URL/key.
2. Create a Supabase Auth user for the app owner/admin.
3. Open InterventionOS → Admin → Connect cloud sync.
4. Sign in with the Supabase Auth email/password.

When signed in, the app keeps local iPhone storage as a fallback and syncs families, appointments, and tasks to Supabase.

## Telegram/Hermes assistant access

The repo includes a Supabase Edge Function:

```text
supabase/functions/interventionos-agent
```

Deploy it and set these Supabase secrets:

```sh
INTERVENTIONOS_AGENT_TOKEN=<generated-long-random-token>
INTERVENTIONOS_OWNER_USER_ID=<supabase-auth-user-uuid-for-matt>
```

Recommended token generation:

```sh
openssl rand -hex 32
```

The function is intentionally protected by a server-side token instead of exposing write access through the Expo frontend. It supports these actions:

```text
dashboard
list_families
get_family
create_family
update_family
add_case_note
list_schedule
create_appointment
list_tasks
create_task
complete_task
```

Example server-side call:

```sh
curl -X POST "$SUPABASE_URL/functions/v1/interventionos-agent" \
  -H "Content-Type: application/json" \
  -H "x-interventionos-agent-token: $INTERVENTIONOS_AGENT_TOKEN" \
  -d '{"action":"dashboard","args":{"appointmentLimit":5,"taskLimit":5}}'
```

Do not put `INTERVENTIONOS_AGENT_TOKEN`, service-role keys, or other secrets in Expo/frontend code.

## Current Features

- Intervention and Coaching case pipelines
- Add family with case amount and payment status
- Expandable family files with editable participants, contacts, notes, focus, and documents
- Archive and restore families from Admin
- Schedule and Tasks split
- Automatic Google Calendar sync labeling for schedule entries and tasks
- Revenue dashboard for MTD/YTD collected and owed totals
- Supabase cloud schema, optional owner sign-in sync, and secure Hermes/Telegram assistant Edge Function
