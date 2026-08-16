-- LUNCH PICK 공동주문 백엔드
-- Supabase Dashboard > SQL Editor에서 이 파일 전체를 한 번 실행하세요.
begin;

create table if not exists public.order_rooms (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 40),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  host_name text not null check (char_length(host_name) between 1 and 12),
  status text not null default 'open' check (status in ('open', 'closed')),
  deadline_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.order_room_options (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.order_rooms(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  position smallint not null check (position between 1 and 3),
  unique (room_id, id),
  unique (room_id, position)
);

create table if not exists public.order_room_members (
  room_id uuid not null references public.order_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 12),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create unique index if not exists order_room_members_unique_nickname
  on public.order_room_members (room_id, lower(nickname));

create table if not exists public.order_room_votes (
  room_id uuid not null,
  user_id uuid not null,
  option_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id),
  foreign key (room_id, user_id)
    references public.order_room_members(room_id, user_id) on delete cascade,
  foreign key (room_id, option_id)
    references public.order_room_options(room_id, id) on delete cascade
);

alter table public.order_rooms enable row level security;
alter table public.order_room_options enable row level security;
alter table public.order_room_members enable row level security;
alter table public.order_room_votes enable row level security;

-- 정책 안에서 같은 members 테이블을 다시 조회할 때 생기는 재귀를 피하는 보안 함수입니다.
create or replace function public.is_order_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.order_room_members member
    where member.room_id = p_room_id
      and member.user_id = auth.uid()
  );
$$;

drop policy if exists "members read rooms" on public.order_rooms;
create policy "members read rooms" on public.order_rooms
  for select to authenticated
  using (public.is_order_room_member(id));

drop policy if exists "members read options" on public.order_room_options;
create policy "members read options" on public.order_room_options
  for select to authenticated
  using (public.is_order_room_member(room_id));

drop policy if exists "members read members" on public.order_room_members;
create policy "members read members" on public.order_room_members
  for select to authenticated
  using (public.is_order_room_member(room_id));

drop policy if exists "members read votes" on public.order_room_votes;
create policy "members read votes" on public.order_room_votes
  for select to authenticated
  using (public.is_order_room_member(room_id));

-- 링크의 UUID를 알고 있는 익명 인증 사용자에게 화면 표시용 방 상태를 반환합니다.
-- 테이블 직접 쓰기는 허용하지 않고 아래 RPC에서만 입력 검증과 권한 확인을 수행합니다.
create or replace function public.get_order_room(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  select jsonb_build_object(
    'id', room.id,
    'title', room.title,
    'hostName', room.host_name,
    'createdAt', room.created_at,
    'deadlineAt', room.deadline_at,
    'members', coalesce((
      select jsonb_agg(member.nickname order by member.joined_at)
      from public.order_room_members member
      where member.room_id = room.id
    ), '[]'::jsonb),
    'options', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', option.id,
          'name', option.name,
          'voters', coalesce((
            select jsonb_agg(member.nickname order by vote.updated_at)
            from public.order_room_votes vote
            join public.order_room_members member
              on member.room_id = vote.room_id and member.user_id = vote.user_id
            where vote.room_id = room.id and vote.option_id = option.id
          ), '[]'::jsonb)
        ) order by option.position
      )
      from public.order_room_options option
      where option.room_id = room.id
    ), '[]'::jsonb)
  ) into v_result
  from public.order_rooms room
  where room.id = p_room_id;

  if v_result is null then
    raise exception 'room_not_found';
  end if;
  return v_result;
end;
$$;

create or replace function public.create_order_room(
  p_title text,
  p_host_name text,
  p_deadline_minutes integer,
  p_candidates text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room_id uuid;
  v_candidate_count integer;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if char_length(btrim(p_title)) not between 1 and 40 then raise exception 'invalid_title'; end if;
  if char_length(btrim(p_host_name)) not between 1 and 12 then raise exception 'invalid_nickname'; end if;
  if p_deadline_minutes not between 5 and 1440 then raise exception 'invalid_deadline'; end if;
  if coalesce(array_length(p_candidates, 1), 0) not between 2 and 3 then raise exception 'invalid_candidates'; end if;

  select count(distinct lower(btrim(candidate))) into v_candidate_count
  from unnest(p_candidates) candidate
  where char_length(btrim(candidate)) between 1 and 24;
  if v_candidate_count <> array_length(p_candidates, 1) then raise exception 'invalid_candidates'; end if;

  insert into public.order_rooms(title, host_user_id, host_name, deadline_at)
  values (btrim(p_title), auth.uid(), btrim(p_host_name), now() + make_interval(mins => p_deadline_minutes))
  returning id into v_room_id;

  insert into public.order_room_members(room_id, user_id, nickname)
  values (v_room_id, auth.uid(), btrim(p_host_name));

  insert into public.order_room_options(room_id, name, position)
  select v_room_id, btrim(candidate), position::smallint
  from unnest(p_candidates) with ordinality as item(candidate, position);

  return public.get_order_room(v_room_id);
end;
$$;

create or replace function public.join_order_room(p_room_id uuid, p_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.order_rooms%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if char_length(btrim(p_nickname)) not between 1 and 12 then raise exception 'invalid_nickname'; end if;

  select * into v_room from public.order_rooms where id = p_room_id for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.status <> 'open' or v_room.deadline_at <= now() then raise exception 'room_expired'; end if;

  begin
    insert into public.order_room_members(room_id, user_id, nickname)
    values (p_room_id, auth.uid(), btrim(p_nickname))
    on conflict (room_id, user_id) do update set nickname = excluded.nickname;
  exception when unique_violation then
    raise exception 'nickname_already_used';
  end;

  return public.get_order_room(p_room_id);
end;
$$;

create or replace function public.cast_order_vote(p_room_id uuid, p_option_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.order_rooms%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into v_room from public.order_rooms where id = p_room_id for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.status <> 'open' or v_room.deadline_at <= now() then raise exception 'room_expired'; end if;
  if not public.is_order_room_member(p_room_id) then raise exception 'membership_required'; end if;
  if not exists (
    select 1 from public.order_room_options option
    where option.room_id = p_room_id and option.id = p_option_id
  ) then raise exception 'invalid_option'; end if;

  insert into public.order_room_votes(room_id, user_id, option_id, updated_at)
  values (p_room_id, auth.uid(), p_option_id, now())
  on conflict (room_id, user_id)
  do update set option_id = excluded.option_id, updated_at = excluded.updated_at;

  return public.get_order_room(p_room_id);
end;
$$;

create or replace function public.delete_order_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not exists (
    select 1 from public.order_rooms room
    where room.id = p_room_id and room.host_user_id = auth.uid()
  ) then raise exception 'host_only'; end if;
  delete from public.order_rooms where id = p_room_id;
end;
$$;

-- 브라우저 역할에는 읽기만 허용하고 모든 쓰기는 검증된 RPC로 제한합니다.
revoke all on public.order_rooms, public.order_room_options, public.order_room_members, public.order_room_votes from anon, authenticated;
grant select on public.order_rooms, public.order_room_options, public.order_room_members, public.order_room_votes to authenticated;

revoke all on function public.is_order_room_member(uuid) from public, anon;
revoke all on function public.get_order_room(uuid) from public, anon;
revoke all on function public.create_order_room(text, text, integer, text[]) from public, anon;
revoke all on function public.join_order_room(uuid, text) from public, anon;
revoke all on function public.cast_order_vote(uuid, uuid) from public, anon;
revoke all on function public.delete_order_room(uuid) from public, anon;
grant execute on function public.is_order_room_member(uuid) to authenticated;
grant execute on function public.get_order_room(uuid) to authenticated;
grant execute on function public.create_order_room(text, text, integer, text[]) to authenticated;
grant execute on function public.join_order_room(uuid, text) to authenticated;
grant execute on function public.cast_order_vote(uuid, uuid) to authenticated;
grant execute on function public.delete_order_room(uuid) to authenticated;

-- 반복 실행해도 이미 등록된 테이블에서 오류가 나지 않도록 확인 후 Realtime에 추가합니다.
do $$
declare
  v_table text;
begin
  foreach v_table in array array['order_rooms', 'order_room_options', 'order_room_members', 'order_room_votes']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;

commit;
