-- Add functional intervention checklist state to family case records.
-- The React Native app stores the checklist as JSON so new checklist items can be
-- added without another schema migration.

alter table public.families
  add column if not exists checklist jsonb not null default '{}'::jsonb;

comment on column public.families.checklist is
  'Intervention case checklist state keyed by item name, e.g. contractSent/paymentReceived.';
