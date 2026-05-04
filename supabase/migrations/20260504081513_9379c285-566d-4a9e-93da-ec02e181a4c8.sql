-- Enable extensions for scheduled sync
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Holiday category enum
DO $$ BEGIN
  CREATE TYPE public.holiday_category AS ENUM ('jewish', 'muslim', 'christian', 'national', 'ward');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.public_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  name_he text NOT NULL DEFAULT '',
  name_en text NOT NULL DEFAULT '',
  category public.holiday_category NOT NULL,
  is_eve boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'manual',
  hebcal_uid text UNIQUE,
  region text NOT NULL DEFAULT 'IL',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX IF NOT EXISTS idx_public_holidays_date ON public.public_holidays(date);
CREATE INDEX IF NOT EXISTS idx_public_holidays_category ON public.public_holidays(category);

ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view holidays" ON public.public_holidays;
CREATE POLICY "Authenticated can view holidays"
  ON public.public_holidays FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Managers can manage holidays" ON public.public_holidays;
CREATE POLICY "Managers can manage holidays"
  ON public.public_holidays FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'assistant_manager'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'assistant_manager'::app_role));

DROP TRIGGER IF EXISTS trg_public_holidays_updated_at ON public.public_holidays;
CREATE TRIGGER trg_public_holidays_updated_at
  BEFORE UPDATE ON public.public_holidays
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();