CREATE TABLE public.friction_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shift_id UUID,
  user_id UUID,
  created_by UUID,
  date DATE NOT NULL,
  shift_type TEXT,
  warning_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'yellow',
  message TEXT NOT NULL,
  was_shown BOOLEAN NOT NULL DEFAULT false,
  was_overridden BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_friction_log_date_user ON public.friction_log(date, user_id);
CREATE INDEX idx_friction_log_created_at ON public.friction_log(created_at DESC);

ALTER TABLE public.friction_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view friction log"
ON public.friction_log FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'assistant_manager'::app_role));

CREATE POLICY "Authenticated can insert friction log"
ON public.friction_log FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);
