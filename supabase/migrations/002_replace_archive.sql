-- Atomic JSON archive replacement for the authenticated user's data.
-- Apply this in Supabase SQL Editor after creating the four application tables.

create or replace function public.replace_archive(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  item jsonb;
  archive_version integer;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;

  archive_version := coalesce((p_payload ->> 'version')::integer, 0);
  if archive_version <> 1 then
    raise exception 'unsupported archive version: %', archive_version;
  end if;

  if jsonb_typeof(coalesce(p_payload -> 'months', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_payload -> 'yearParams', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_payload -> 'trms', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_payload -> 'trmMonthsLoaded', '[]'::jsonb)) <> 'array' then
    raise exception 'invalid archive structure';
  end if;

  delete from public.months where user_id = current_user_id;
  delete from public.year_params where user_id = current_user_id;
  delete from public.trm_quotes where user_id = current_user_id;
  delete from public.trm_months where user_id = current_user_id;

  for item in select value from jsonb_array_elements(p_payload -> 'months') loop
    insert into public.months (
      user_id, year_month, sources, params, result,
      ibc_final, total_contributions
    ) values (
      current_user_id,
      item ->> 'yearMonth',
      coalesce(item -> 'sources', '[]'::jsonb),
      coalesce(item -> 'params', '{}'::jsonb),
      item -> 'result',
      coalesce((item -> 'result' ->> 'ibcFinal')::bigint, 0),
      coalesce((item -> 'result' ->> 'totalContributions')::bigint, 0)
    );
  end loop;

  for item in select value from jsonb_array_elements(p_payload -> 'yearParams') loop
    insert into public.year_params (user_id, year, params)
    values (current_user_id, (item ->> 'year')::integer, item);
  end loop;

  for item in select value from jsonb_array_elements(p_payload -> 'trms') loop
    insert into public.trm_quotes (user_id, quote_date, quote)
    values (current_user_id, (item ->> 'date')::date, item);
  end loop;

  for item in select value from jsonb_array_elements_text(p_payload -> 'trmMonthsLoaded') loop
    insert into public.trm_months (user_id, year_month)
    values (current_user_id, item);
  end loop;
end;
$$;

revoke all on function public.replace_archive(jsonb) from public;
grant execute on function public.replace_archive(jsonb) to authenticated;
