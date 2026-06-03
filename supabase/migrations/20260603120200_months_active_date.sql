-- The date a month becomes "active" (its picks materialize into films). Defaults to the
-- 1st of the month; admin-adjustable, and the admin can trigger activation early.
alter table public.months add column if not exists active_date date;
update public.months set active_date = (month_year || '-01')::date where active_date is null;
