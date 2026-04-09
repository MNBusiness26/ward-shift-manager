CREATE POLICY "Managers can update any profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (has_role(auth.uid(), 'manager'::app_role));