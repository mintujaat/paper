-- Mintu Exam Hub (React + Supabase) — Complete Database Schema
-- Run once in Supabase Dashboard -> SQL Editor -> New query.

create extension if not exists pgcrypto;

create table if not exists public.quiz_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  city text not null default '',
  password_hash text,
  password_salt text,
  google_sub text,
  avatar_url text not null default '',
  paper_credits integer not null default 0 check (paper_credits >= 0),
  free_papers_used integer not null default 0,
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.quiz_users add column if not exists paper_credits integer not null default 0 check (paper_credits >= 0);
create unique index if not exists quiz_users_email_lower_uidx on public.quiz_users (lower(email));
create unique index if not exists quiz_users_google_sub_uidx on public.quiz_users (google_sub) where google_sub is not null;

create table if not exists public.quiz_free_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.quiz_users(id) on delete cascade,
  device_id text not null default '',
  device_fp text not null default '',
  ip_hash text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists quiz_free_claims_device_idx on public.quiz_free_claims (device_id) where device_id <> '';
create index if not exists quiz_free_claims_fp_idx on public.quiz_free_claims (device_fp) where device_fp <> '';
create index if not exists quiz_free_claims_ip_idx on public.quiz_free_claims (ip_hash) where ip_hash <> '';

create table if not exists public.quiz_plans (
  id text primary key,
  title text not null,
  papers_count integer not null check (papers_count >= 1),
  price_inr numeric(10,2) not null check (price_inr > 0),
  badge text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.quiz_plans (id, title, papers_count, price_inr, badge, sort_order, active) values
('plan-1', 'Single Paper Pass', 1, 25, 'Starter', 1, true),
('plan-5', '5 Papers Value Pack', 5, 50, 'Popular · Save 60%', 2, true),
('plan-15', '15 Papers Pro Pack', 15, 100, 'Best Value · ₹6.6/paper', 3, true)
on conflict (id) do nothing;

create table if not exists public.quiz_papers (
  id text primary key,
  title text not null,
  category text not null default 'HSSC',
  description text not null default '',
  duration_minutes integer not null default 15 check (duration_minutes between 1 and 180),
  questions_per_attempt integer not null default 25 check (questions_per_attempt between 1 and 100),
  price_inr numeric(10,2) not null default 25 check (price_inr >= 0),
  sponsor_name text not null default '',
  sponsor_tagline text not null default '',
  sponsor_link text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  paper_id text not null references public.quiz_papers(id) on delete cascade,
  question_text text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  correct_option text not null check (correct_option in ('A','B','C','D')),
  explanation text not null default '',
  topic text not null default 'General',
  difficulty text not null default 'medium' check (difficulty in ('easy','medium','hard')),
  reported_count integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists quiz_questions_paper_idx on public.quiz_questions (paper_id, active);

create table if not exists public.quiz_payments (
  razorpay_order_id text primary key,
  user_id uuid not null references public.quiz_users(id) on delete cascade,
  paper_id text,
  plan_id text,
  credits_count integer not null default 1,
  amount numeric(10,2) not null check (amount > 0),
  currency text not null default 'INR',
  status text not null default 'created' check (status in ('created','paid','failed')),
  payment_id text,
  used_for_attempt_id uuid,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
alter table public.quiz_payments add column if not exists plan_id text;
alter table public.quiz_payments add column if not exists credits_count integer not null default 1;
alter table public.quiz_payments alter column paper_id drop not null;
create index if not exists quiz_payments_user_idx on public.quiz_payments (user_id, status);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.quiz_users(id) on delete cascade,
  paper_id text not null references public.quiz_papers(id) on delete cascade,
  user_name text not null default '',
  user_email text not null default '',
  user_city text not null default '',
  share_with_sponsor boolean not null default false,
  question_ids jsonb not null default '[]'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  score integer not null default 0,
  total_questions integer not null default 25,
  accuracy_percent numeric(5,2) not null default 0,
  time_taken_sec integer not null default 0,
  is_free boolean not null default false,
  razorpay_order_id text,
  status text not null default 'in_progress' check (status in ('in_progress','completed')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz
);
create index if not exists quiz_attempts_user_idx on public.quiz_attempts (user_id, started_at desc);
create index if not exists quiz_attempts_paper_score_idx on public.quiz_attempts (paper_id, status, score desc, time_taken_sec asc);

create table if not exists public.quiz_settings (
  id text primary key,
  site_name text not null default 'YaadPage',
  free_papers_per_device integer not null default 1,
  default_paper_price numeric(10,2) not null default 25,
  announcement_enabled boolean not null default false,
  announcement_text text not null default '',
  total_visitors bigint not null default 0,
  today_visitors bigint not null default 0,
  visitor_day date not null default current_date,
  updated_at timestamptz not null default now()
);
insert into public.quiz_settings (id, site_name, free_papers_per_device, default_paper_price)
values ('main', 'YaadPage', 1, 25)
on conflict (id) do nothing;

create or replace function public.quiz_increment_visitor()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_total bigint; v_today bigint;
begin
  update public.quiz_settings
  set
    total_visitors = total_visitors + 1,
    today_visitors = case when visitor_day = current_date then today_visitors + 1 else 1 end,
    visitor_day = current_date,
    updated_at = now()
  where id = 'main'
  returning total_visitors, today_visitors into v_total, v_today;
  return jsonb_build_object('totalVisitors', coalesce(v_total, 0), 'todayVisitors', coalesce(v_today, 0));
end;
$$;

-- Atomic Razorpay plan credit: adds papers_count to quiz_users.paper_credits exactly once.
create or replace function public.quiz_credit_plan_payment(
  p_razorpay_order_id text,
  p_payment_id text,
  p_user_id uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_pay public.quiz_payments%rowtype;
  v_credits integer;
begin
  select * into v_pay from public.quiz_payments where razorpay_order_id = p_razorpay_order_id for update;
  if not found then raise exception 'Payment record not found.'; end if;
  if v_pay.user_id <> p_user_id then raise exception 'Payment belongs to another account.'; end if;
  if v_pay.status = 'paid' then
    select paper_credits into v_credits from public.quiz_users where id = p_user_id;
    return jsonb_build_object('ok', true, 'alreadyCredited', true, 'paperCredits', v_credits);
  end if;
  update public.quiz_users
    set paper_credits = paper_credits + greatest(1, coalesce(v_pay.credits_count, 1)), updated_at = now()
    where id = p_user_id and disabled = false
    returning paper_credits into v_credits;
  if not found then raise exception 'Account unavailable.'; end if;
  update public.quiz_payments set status = 'paid', payment_id = p_payment_id, paid_at = now() where razorpay_order_id = p_razorpay_order_id;
  return jsonb_build_object('ok', true, 'alreadyCredited', false, 'paperCredits', v_credits, 'addedCredits', v_pay.credits_count, 'amount', v_pay.amount);
end;
$$;

-- RLS locked down to service_role
alter table public.quiz_users enable row level security;
alter table public.quiz_free_claims enable row level security;
alter table public.quiz_plans enable row level security;
alter table public.quiz_papers enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_payments enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.quiz_settings enable row level security;

grant usage on schema public to service_role;
revoke all on public.quiz_users, public.quiz_free_claims, public.quiz_plans, public.quiz_papers, public.quiz_questions, public.quiz_payments, public.quiz_attempts, public.quiz_settings from public, anon, authenticated;
grant all on public.quiz_users, public.quiz_free_claims, public.quiz_plans, public.quiz_papers, public.quiz_questions, public.quiz_payments, public.quiz_attempts, public.quiz_settings to service_role;
revoke all on function public.quiz_increment_visitor() from public, anon, authenticated;
grant execute on function public.quiz_increment_visitor() to service_role;
revoke all on function public.quiz_credit_plan_payment(text,text,uuid) from public, anon, authenticated;
grant execute on function public.quiz_credit_plan_payment(text,text,uuid) to service_role;

-- Seed 4 starter exam papers
insert into public.quiz_papers (id, title, category, description, duration_minutes, questions_per_attempt, price_inr, active) values
('hssc-cet', 'HSSC CET Group C & D Mock Test', 'HSSC', 'Haryana GK, Reasoning, Maths, Hindi & English — 25 random questions from our bank.', 15, 25, 25, true),
('haryana-police', 'Haryana Police Constable Mock Test', 'Police', 'General Studies, Haryana GK, Reasoning & Numerical Ability practice test.', 15, 25, 25, true),
('ssc-gd', 'SSC GD Constable Mock Test', 'SSC', 'Latest pattern 15-minute speed test covering GK, Maths, Reasoning & Hindi/English.', 15, 25, 25, true),
('board-12th', 'Class 12th Board MCQ Practice', 'Board', 'Important objective MCQs for Physics, Chemistry, Maths & English.', 15, 25, 25, true)
on conflict (id) do nothing;

-- Seed 25 starter questions for HSSC CET
insert into public.quiz_questions (paper_id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, topic, difficulty)
select * from (values
('hssc-cet', 'Which district of Haryana is known as the "Chhoti Kashi" due to its many temples?', 'Bhiwani', 'Rohtak', 'Hisar', 'Karnal', 'A', 'Bhiwani is popularly called Chhoti Kashi of Haryana because of its large number of temples.', 'Haryana GK', 'easy'),
('hssc-cet', 'In which year was Haryana formed as a separate state of India?', '1962', '1966', '1971', '1956', 'B', 'Haryana was carved out of Punjab on 1 November 1966.', 'Haryana GK', 'easy'),
('hssc-cet', 'Which city in Haryana is famous as the "City of Weavers" (Bunkaron ka Shahar)?', 'Ambala', 'Panipat', 'Sonipat', 'Sirsa', 'B', 'Panipat is renowned for its textile and handloom industry.', 'Haryana GK', 'easy'),
('hssc-cet', 'Sultanpur National Park is located in which district of Haryana?', 'Gurugram', 'Faridabad', 'Jhajjar', 'Rewari', 'A', 'Sultanpur National Park is situated in Gurugram district and is famous for migratory birds.', 'Haryana GK', 'easy'),
('hssc-cet', 'Who was the first Chief Minister of Haryana?', 'Bansi Lal', 'Devi Lal', 'Bhagwat Dayal Sharma', 'Rao Birender Singh', 'C', 'Pt. Bhagwat Dayal Sharma served as the first Chief Minister of Haryana in 1966.', 'Haryana GK', 'easy'),
('hssc-cet', 'The famous Battle of Panipat (First) in 1526 was fought between Babur and whom?', 'Hemu', 'Ibrahim Lodi', 'Sher Shah Suri', 'Prithviraj Chauhan', 'B', 'Babur defeated Ibrahim Lodi in the First Battle of Panipat in 1526.', 'History', 'easy'),
('hssc-cet', 'Which river forms the eastern boundary of Haryana with Uttar Pradesh?', 'Ghaggar', 'Markanda', 'Yamuna', 'Sahibi', 'C', 'The Yamuna river flows along the eastern border of Haryana.', 'Geography', 'easy'),
('hssc-cet', 'If a train 150 m long passes a pole in 10 seconds, what is its speed in km/h?', '45 km/h', '54 km/h', '60 km/h', '72 km/h', 'B', 'Speed = 150/10 = 15 m/s = 15 * 18/5 = 54 km/h.', 'Maths', 'medium'),
('hssc-cet', 'What is the next number in the series: 3, 7, 15, 31, 63, ?', '125', '127', '129', '131', 'B', 'Each term is (previous * 2) + 1: 63*2 + 1 = 127.', 'Reasoning', 'easy'),
('hssc-cet', 'Which vitamin is mainly produced in the human body when exposed to sunlight?', 'Vitamin A', 'Vitamin B12', 'Vitamin C', 'Vitamin D', 'D', 'Sunlight triggers Vitamin D synthesis in the skin.', 'Science', 'easy'),
('hssc-cet', 'Who is known as the "Iron Man of India"?', 'Subhas Chandra Bose', 'Sardar Vallabhbhai Patel', 'Bhagat Singh', 'Lal Bahadur Shastri', 'B', 'Sardar Vallabhbhai Patel is called the Iron Man of India.', 'General Knowledge', 'easy'),
('hssc-cet', 'What is 15% of 400?', '45', '50', '60', '75', 'C', '15/100 * 400 = 60.', 'Maths', 'easy'),
('hssc-cet', 'Which of the following is the largest district of Haryana by area?', 'Sirsa', 'Hisar', 'Bhiwani', 'Jind', 'A', 'Sirsa became the largest district by area after Charkhi Dadri was carved out of Bhiwani.', 'Haryana GK', 'medium'),
('hssc-cet', 'Where is the National Dairy Research Institute (NDRI) located in Haryana?', 'Hisar', 'Karnal', 'Rohtak', 'Kurukshetra', 'B', 'NDRI is located in Karnal, Haryana.', 'Haryana GK', 'easy'),
('hssc-cet', 'Find the odd one out: Apple, Mango, Potato, Banana.', 'Apple', 'Mango', 'Potato', 'Banana', 'C', 'Potato is a vegetable (tuber), whereas the others are fruits.', 'Reasoning', 'easy'),
('hssc-cet', 'Which Article of the Indian Constitution abolishes Untouchability?', 'Article 14', 'Article 17', 'Article 19', 'Article 21', 'B', 'Article 17 abolishes untouchability and forbids its practice.', 'Polity', 'medium'),
('hssc-cet', 'What is the SI unit of Electric Current?', 'Volt', 'Ohm', 'Ampere', 'Watt', 'C', 'The SI unit of electric current is Ampere (A).', 'Science', 'easy'),
('hssc-cet', 'If A + B = 20 and A - B = 6, what is the value of A?', '11', '12', '13', '14', 'C', 'Adding both equations: 2A = 26, so A = 13.', 'Maths', 'easy'),
('hssc-cet', 'In which district of Haryana is the Brahma Sarovar located?', 'Kurukshetra', 'Kaithal', 'Panipat', 'Yamunanagar', 'A', 'Brahma Sarovar is a sacred water tank in Kurukshetra.', 'Haryana GK', 'easy'),
('hssc-cet', 'What does CPU stand for in computers?', 'Central Process Unit', 'Central Processing Unit', 'Computer Personal Unit', 'Core Processing Unit', 'B', 'CPU stands for Central Processing Unit.', 'Computer', 'easy'),
('hssc-cet', 'Which gas is most abundant in Earth''s atmosphere?', 'Oxygen', 'Carbon Dioxide', 'Nitrogen', 'Argon', 'C', 'Nitrogen makes up about 78% of Earth''s atmosphere.', 'Science', 'easy'),
('hssc-cet', 'If CAT is coded as 3120, how is DOG coded?', '4157', '4147', '4156', '3157', 'A', 'D=4, O=15, G=7 -> 4157.', 'Reasoning', 'medium'),
('hssc-cet', 'The Haryana State Animal is:', 'Lion', 'Blackbuck', 'Nilgai', 'Tiger', 'B', 'The Blackbuck (Kala Hiran) is the state animal of Haryana.', 'Haryana GK', 'easy'),
('hssc-cet', 'What is the average of first 5 prime numbers (2, 3, 5, 7, 11)?', '5.2', '5.4', '5.6', '5.8', 'C', 'Sum = 2+3+5+7+11 = 28; 28/5 = 5.6.', 'Maths', 'medium'),
('hssc-cet', 'Which shortcut key is used to copy selected text in Windows?', 'Ctrl + X', 'Ctrl + C', 'Ctrl + V', 'Ctrl + Z', 'B', 'Ctrl + C copies selected text.', 'Computer', 'easy')
) as v(paper_id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, topic, difficulty)
where not exists (select 1 from public.quiz_questions where paper_id = 'hssc-cet');

notify pgrst, 'reload schema';

-- Fast paper question counts RPC (avoids transferring thousands of rows)
create or replace function public.quiz_paper_counts()
returns table(paper_id text, cnt integer)
language sql security definer set search_path = public
as $$
  select paper_id, count(*)::integer as cnt
  from public.quiz_questions
  where active = true
  group by paper_id;
$$;
revoke all on function public.quiz_paper_counts() from public, anon, authenticated;
grant execute on function public.quiz_paper_counts() to service_role;

-- Student Saved / Bookmarked Questions for Revision
create table if not exists public.quiz_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.quiz_users(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  paper_id text not null,
  created_at timestamptz not null default now(),
  unique(user_id, question_id)
);
create index if not exists quiz_bookmarks_user_idx on public.quiz_bookmarks (user_id, created_at desc);
alter table public.quiz_bookmarks enable row level security;
revoke all on public.quiz_bookmarks from public, anon, authenticated;
grant all on public.quiz_bookmarks to service_role;

notify pgrst, 'reload schema';
