create table if not exists public.publications (
  id text primary key,
  title text not null,
  authors text not null default '',
  category text not null default 'Journal',
  date date not null default current_date,
  link text not null default '',
  description text not null default '',
  has_pdf boolean not null default false,
  pdf_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.publications enable row level security;

drop policy if exists "Anyone can read publications" on public.publications;
create policy "Anyone can read publications"
  on public.publications for select using (true);

drop policy if exists "Authenticated users can manage publications" on public.publications;
create policy "Authenticated users can manage publications"
  on public.publications for all to authenticated using (true) with check (true);

insert into public.publications (id, title, authors, category, date, link, description, has_pdf, pdf_name)
select id, title, authors, category, date::date, link, description, "hasPdf", "pdfName"
from jsonb_to_recordset($seed$
[
  {"id":"test-pub-101","title":"Global Solar Energy Analysis","authors":"Dr. A. Karthik, S. Suman","category":"Journal","date":"2026-08-29","link":"https://doi.org/10.1000/solar123","description":"Global cross-device test paper for central database API.","hasPdf":true,"pdfName":"solar_energy.pdf"},
  {"id":"seed-1","title":"Advances in Sustainable Materials for Civil Infrastructure","authors":"Dr. A. Karthik, R. Menon","category":"Journal","date":"2026-07-14","link":"","description":"A peer-reviewed study examining low-carbon composite materials for long-span infrastructure, with lifecycle cost modelling across three climates.","hasPdf":false,"pdfName":""},
  {"id":"seed-2","title":"Adaptive Signal Filtering Method for Low-Power IoT Sensors","authors":"Mr. V. Santhosh Kumar","category":"Patent","date":"2026-06-02","link":"","description":"Patent publication documenting a novel adaptive filtering circuit that reduces power draw in distributed sensor networks by up to 34%.","hasPdf":false,"pdfName":""},
  {"id":"seed-3","title":"Interdisciplinary Approaches to Public Health Policy Design","authors":"Dr. Satyanand Singh","category":"Ph.D. Thesis","date":"2026-05-20","link":"","description":"A doctoral thesis synthesizing epidemiology, behavioural economics and policy science to model community health interventions.","hasPdf":false,"pdfName":""}
]
$seed$::jsonb) as seed(id text, title text, authors text, category text, date text, link text, description text, "hasPdf" boolean, "pdfName" text)
where not exists (select 1 from public.publications);

insert into storage.buckets (id, name, public)
values ('publication-pdfs', 'publication-pdfs', false)
on conflict (id) do nothing;

create or replace function public.set_publications_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists publications_updated_at on public.publications;
create trigger publications_updated_at
before update on public.publications
for each row execute function public.set_publications_updated_at();
