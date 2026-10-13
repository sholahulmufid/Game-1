-- CONNECTED: run once in a Supabase project's SQL Editor.
-- cn_ tables coexist with previous projects. Movement uses Realtime Broadcast;
-- only lobby and checkpoint snapshots are stored in PostgreSQL.
begin;
create table public.cn_rooms (
 id uuid primary key default gen_random_uuid(),room_code text not null unique,
 status text not null default 'lobby',host_player_id uuid,channel_id uuid not null default gen_random_uuid(),
 created_at timestamptz not null default now(),expires_at timestamptz not null default(now()+interval '24 hours')
);
create table public.cn_players (
 id uuid primary key default gen_random_uuid(),room_id uuid not null references public.cn_rooms(id) on delete cascade,
 nickname text not null check(char_length(nickname) between 2 and 20),token uuid not null,
 character text not null check(character in ('nova','echo')),ready boolean not null default false,
 connected boolean not null default true,last_seen timestamptz not null default now(),unique(room_id,character)
);
create unique index cn_room_nickname on public.cn_players(room_id,lower(nickname));
create table public.cn_sessions (
 id uuid primary key default gen_random_uuid(),room_id uuid not null unique references public.cn_rooms(id) on delete cascade,
 current_level integer not null default 0 check(current_level between 0 and 6),checkpoint integer not null default 0,
 status text not null default 'lobby',started_at timestamptz
);
create table public.cn_level_state (
 session_id uuid not null references public.cn_sessions(id) on delete cascade,object_key text not null,
 state jsonb,updated_at timestamptz not null default now(),primary key(session_id,object_key)
);
create table public.cn_room_events (
 id uuid primary key default gen_random_uuid(),room_id uuid not null unique references public.cn_rooms(id) on delete cascade,
 version bigint not null default 0
);
alter table public.cn_rooms enable row level security;
alter table public.cn_players enable row level security;
alter table public.cn_sessions enable row level security;
alter table public.cn_level_state enable row level security;
alter table public.cn_room_events enable row level security;
revoke all on public.cn_rooms,public.cn_players,public.cn_sessions,public.cn_level_state,public.cn_room_events from anon,authenticated;
grant select on public.cn_room_events to anon,authenticated;
create policy "Opaque connected room notifications" on public.cn_room_events for select to anon,authenticated using(true);

create function public.cn_command(p_code text,p_nickname text,p_token uuid,p_action text,p_payload jsonb default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 r public.cn_rooms;p public.cn_players;s public.cn_sessions;e public.cn_room_events;
 n integer;changed boolean:=false;people jsonb;snapshot jsonb;level integer;stamp bigint;
begin
 p_code:=upper(trim(p_code));p_nickname:=trim(p_nickname);
 if p_token is null or p_nickname is null or char_length(p_nickname) not between 2 and 20
  or p_action is null or p_action not in ('create','join','heartbeat','leave','ready','save','replay') then raise exception 'INVALID_INPUT';end if;
 if p_action='create' then
  for n in 1..10 loop
   begin
    insert into public.cn_rooms(room_code) values('CN'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4))) returning * into r;exit;
   exception when unique_violation then if n=10 then raise exception 'CREATE_FAILED';end if;end;
  end loop;
  insert into public.cn_players(room_id,nickname,token,character) values(r.id,p_nickname,p_token,'nova') returning * into p;
  update public.cn_rooms set host_player_id=p.id where id=r.id;r.host_player_id:=p.id;
  insert into public.cn_sessions(room_id) values(r.id) returning * into s;
  insert into public.cn_level_state(session_id,object_key,state) values(s.id,'checkpoint_snapshot',null);
  insert into public.cn_room_events(room_id) values(r.id);changed:=true;
 else
  select * into r from public.cn_rooms where room_code=p_code for update;
  if not found then raise exception 'ROOM_NOT_FOUND';end if;
  if r.expires_at<clock_timestamp() then raise exception 'ROOM_EXPIRED';end if;
  select * into p from public.cn_players where room_id=r.id and lower(nickname)=lower(p_nickname);
  if p_action='join' then
   if p.id is not null then
    if p.token<>p_token then
     if p.connected and p.last_seen>clock_timestamp()-interval '16 seconds' then raise exception 'NAME_IN_USE';end if;
     update public.cn_players set token=p_token where id=p.id returning * into p;
    end if;
   else
    select count(*) into n from public.cn_players where room_id=r.id;
    if n>=2 or r.status<>'lobby' then raise exception 'ROOM_FULL';end if;
    insert into public.cn_players(room_id,nickname,token,character) values(r.id,p_nickname,p_token,'echo') returning * into p;
   end if;changed:=true;
  elsif p.id is null or p.token<>p_token then raise exception 'INVALID_IDENTITY';end if;
  select * into s from public.cn_sessions where room_id=r.id;
 end if;
 if exists(select 1 from public.cn_players where room_id=r.id and connected and last_seen<clock_timestamp()-interval '16 seconds') then changed:=true;end if;
 update public.cn_players set connected=false,ready=case when r.status='lobby' then false else ready end where room_id=r.id and connected and last_seen<clock_timestamp()-interval '16 seconds';
 if not p.connected then changed:=true;end if;
 if p_action='leave' then update public.cn_players set connected=false,ready=false,last_seen=clock_timestamp() where id=p.id;changed:=true;
 else update public.cn_players set connected=true,last_seen=clock_timestamp() where id=p.id;end if;
 if p_action='ready' and r.status='lobby' then
  update public.cn_players set ready=not ready where id=p.id;
  if (select count(*) from public.cn_players where room_id=r.id and ready and connected)=2 then
   update public.cn_rooms set status='playing' where id=r.id;r.status:='playing';
   update public.cn_sessions set status='playing',started_at=clock_timestamp() where id=s.id;
  end if;changed:=true;
 elsif p_action='save' then
  if p.id<>r.host_player_id then raise exception 'HOST_REQUIRED';end if;
  if r.status not in ('playing','complete') then raise exception 'SESSION_NOT_STARTED';end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>65536
    or not(p_payload ? 'level' and p_payload ? 'status' and p_payload ? 'players' and p_payload ? 'checkpointState' and p_payload ? 'stats') then raise exception 'INVALID_SNAPSHOT';end if;
  if jsonb_typeof(p_payload->'level')<>'number' or (p_payload->>'level')!~'^[0-6]$'
    or p_payload->>'status' not in ('playing','levelComplete','failed','complete')
    or jsonb_typeof(p_payload->'players')<>'array' or jsonb_array_length(p_payload->'players')<>2 then raise exception 'INVALID_SNAPSHOT';end if;
  level:=(p_payload->>'level')::int;
  if p_payload->>'status'='complete' and level<>6 then raise exception 'INVALID_SNAPSHOT';end if;
  update public.cn_level_state set state=p_payload,updated_at=clock_timestamp() where session_id=s.id and object_key='checkpoint_snapshot';
  update public.cn_sessions set current_level=level,checkpoint=coalesce((p_payload->>'checkpoint')::int,0),status=p_payload->>'status' where id=s.id;
  if p_payload->>'status'='complete' then update public.cn_rooms set status='complete' where id=r.id;r.status:='complete';end if;changed:=true;
 elsif p_action='replay' and r.status='complete' then
  if p.id<>r.host_player_id then raise exception 'HOST_REQUIRED';end if;
  update public.cn_rooms set status='lobby' where id=r.id;r.status:='lobby';
  update public.cn_players set ready=false where room_id=r.id;
  update public.cn_sessions set current_level=0,checkpoint=0,status='lobby',started_at=null where id=s.id;
  update public.cn_level_state set state=null,updated_at=clock_timestamp() where session_id=s.id;
  changed:=true;
 end if;
 if changed then update public.cn_room_events set version=version+1 where room_id=r.id;end if;
 select * into e from public.cn_room_events where room_id=r.id;
 select state into snapshot from public.cn_level_state where session_id=s.id and object_key='checkpoint_snapshot';
 select jsonb_agg(jsonb_build_object('id',case when character='nova' then 'a' else 'b' end,'nickname',nickname,'character',character,'ready',ready,'connected',connected) order by character desc) into people from public.cn_players where room_id=r.id;
 stamp:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 return jsonb_build_object('code',r.room_code,'status',r.status,'me',case when p.character='nova' then 'a' else 'b' end,
  'players',people,'channel',r.channel_id,'eventId',e.id,'version',e.version,'snapshot',snapshot,'serverNow',stamp);
end;
$$;
revoke all on function public.cn_command(text,text,uuid,text,jsonb) from public;
grant execute on function public.cn_command(text,text,uuid,text,jsonb) to anon,authenticated;
alter publication supabase_realtime add table public.cn_room_events;
commit;
