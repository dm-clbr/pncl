-- Jordan's September 8 approved SureLC wording and carrier assignments.
update public.portal_todos set description = $copy$Create a separate SureLC account under "Basso-Montemurro". In this account, request ONLY:
• American Amicable
• American General Life (AIG/Corebridge)
• American Home Life
• Liberty Bankers Life
• Royal Neighbors$copy$ where slug = 'surelc_account_1';

update public.portal_todos set description = $copy$Create a separate SureLC account under "The Pinnacle Life Group". In this account, request ONLY:
• Banner (Beyond Term)
• Fidelity & Guaranty$copy$ where slug = 'surelc_account_2';

update public.portal_todos set description = $copy$Create a separate SureLC account under "Pinnacle Life Group". In this account, request ONLY:
• AuguStar
• Foresters
• Kansas City Life
• Mutual of Omaha
• Transamerica$copy$ where slug = 'surelc_account_3';

update public.portal_todos set description = $copy$Submit applications ONLY for the carriers listed under each separate SureLC account:
• SureLC #1, "Basso-Montemurro": American Amicable, American General Life (AIG/Corebridge), American Home Life, Liberty Bankers Life, Royal Neighbors
• SureLC #2, "The Pinnacle Life Group": Banner (Beyond Term), Fidelity & Guaranty
• SureLC #3, "Pinnacle Life Group": AuguStar, Foresters, Kansas City Life, Mutual of Omaha, Transamerica
• Ethos and United Home Life: links are sent to your PNCL email automatically. No SureLC request is needed.$copy$ where slug = 'carrier_applications';

alter table public.portal_tickets drop constraint if exists portal_tickets_type_check;
alter table public.portal_tickets add constraint portal_tickets_type_check
  check (type in ('hierarchy_change', 'pay_tier', 'commission_dispute', 'new_producer', 'other'));
create unique index if not exists portal_tickets_one_new_producer_per_user
  on public.portal_tickets (user_id) where type = 'new_producer';

-- Called only by the authenticated edge function after checking prerequisites.
-- The ticket itself is the authoritative completion record; retries reuse it.
create or replace function public.submit_portal_new_producer(p_user_id uuid, p_description text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  ticket_id uuid;
begin
  perform 1 from public.portal_profiles where user_id = p_user_id for update;
  if not found then raise exception 'Agent not found'; end if;
  if p_description is null or length(trim(p_description)) = 0 or length(p_description) > 5000 then
    raise exception 'Invalid New Producer description';
  end if;

  insert into public.portal_tickets (user_id, type, subject, description)
    values (p_user_id, 'new_producer', 'New Producer submission', p_description)
    on conflict (user_id) where type = 'new_producer' do nothing
    returning id into ticket_id;
  if ticket_id is null then
    select id into ticket_id from public.portal_tickets
      where user_id = p_user_id and type = 'new_producer';
  end if;

  return ticket_id;
end;
$$;
revoke all on function public.submit_portal_new_producer(uuid, text) from public, anon, authenticated;
grant execute on function public.submit_portal_new_producer(uuid, text) to service_role;

-- A browser metadata flag alone must never stand in for the saved ticket.
update public.portal_todos set completion_type = 'auto', auto_key = 'new_producer'
  where slug = 'submit_new_producer';
