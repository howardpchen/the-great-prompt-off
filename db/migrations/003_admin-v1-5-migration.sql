-- Admin Dashboard v1.5 participant-management fields.

alter table participants
  add column if not exists email text;

alter table participants
  add column if not exists is_active boolean not null default true;

create index if not exists participants_active_idx on participants (is_active);
