-- Add or rotate participant access codes to the current format:
-- GPO-XXXX-XXXX where X is A-Z or 0-9.
--
-- Run this before `npm run seed:supabase` if your participants table was created
-- before the access_code column existed, or if existing codes use the older
-- long format such as GPO-8768DC-8966CB.

alter table participants
  add column if not exists access_code text;

alter table participants
  drop constraint if exists participants_access_code_length;

alter table participants
  drop constraint if exists participants_access_code_check;

alter table participants
  drop constraint if exists participants_access_code_format;

update participants
set access_code = 'GPO-' ||
  upper(substr(md5(participant_code || id::text || gen_random_uuid()::text), 1, 4)) ||
  '-' ||
  upper(substr(md5(id::text || participant_code || gen_random_uuid()::text), 1, 4))
where access_code is null
  or access_code = ''
  or access_code !~ '^GPO-[A-Z0-9]{4}-[A-Z0-9]{4}$';

alter table participants
  alter column access_code set not null;

alter table participants
  add constraint participants_access_code_format
  check (access_code ~ '^GPO-[A-Z0-9]{4}-[A-Z0-9]{4}$');

create unique index if not exists participants_access_code_unique
  on participants (access_code);
