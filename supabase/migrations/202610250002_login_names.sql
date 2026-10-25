-- Optional login names for existing Supabase Auth accounts. Email remains the recovery address.
begin;
create table public.account_login_names (
 user_id uuid primary key references auth.users(id) on delete cascade,
 username text not null unique check(username ~ '^[a-z0-9][a-z0-9_.-]{2,31}$'),
 updated_at timestamptz not null default now()
);
alter table public.account_login_names enable row level security;
revoke all on public.account_login_names from public,anon,authenticated,service_role;
grant select on public.account_login_names to authenticated;
create policy read_own_login_name on public.account_login_names for select to authenticated using(user_id=auth.uid());
create function public.set_login_name(p_username text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 insert into public.account_login_names(user_id,username) values(auth.uid(),lower(trim(p_username)))
 on conflict(user_id) do update set username=excluded.username,updated_at=now();
end; $$;
revoke all on function public.set_login_name(text) from public,anon;
grant execute on function public.set_login_name(text) to authenticated;
create function public.resolve_login_email(p_login text) returns text language sql stable security definer set search_path='' as $$
 select u.email from public.account_login_names n join auth.users u on u.id=n.user_id where n.username=lower(trim(p_login));
$$;
revoke all on function public.resolve_login_email(text) from public,anon,authenticated;
grant execute on function public.resolve_login_email(text) to service_role;
notify pgrst,'reload schema';
commit;
