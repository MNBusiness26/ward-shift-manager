
CREATE TABLE public.roster_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version_name text NOT NULL,
  week_start_date date NOT NULL,
  shifts_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.roster_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can manage roster versions"
ON public.roster_versions
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers can insert roster versions"
ON public.roster_versions
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'manager'::app_role));
