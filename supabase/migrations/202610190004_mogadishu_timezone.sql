-- Somalia default time zone. Existing timestamps/punches remain unchanged.
begin;
alter table public.companies alter column timezone set default 'Africa/Mogadishu';
alter table public.branches alter column timezone set default 'Africa/Mogadishu';
alter table public.attendance_devices alter column timezone set default 'Africa/Mogadishu';
update public.companies set timezone='Africa/Mogadishu' where timezone='Africa/Nairobi';
update public.branches set timezone='Africa/Mogadishu' where timezone='Africa/Nairobi';
update public.attendance_devices set timezone='Africa/Mogadishu' where timezone='Africa/Nairobi';

create or replace function public.create_company(p_name text, p_currency text default 'USD', p_timezone text default 'Africa/Mogadishu') returns uuid language plpgsql security definer set search_path=public as $$
declare c uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if length(trim(p_name))<2 or p_currency !~ '^[A-Z]{3}$' or not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Invalid company'; end if;
 insert into companies(name,currency,timezone) values(trim(p_name),p_currency,p_timezone) returning id into c;
 insert into company_memberships(company_id,user_id,role) values(c,auth.uid(),'company_admin');
 return c;
end; $$;
revoke all on function public.create_company(text,text,text) from public,anon;
grant execute on function public.create_company(text,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
