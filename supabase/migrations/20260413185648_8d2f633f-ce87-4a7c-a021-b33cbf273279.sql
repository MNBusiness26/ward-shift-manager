-- Allow managers to insert availability requests on behalf of staff
CREATE POLICY "Managers can create availability requests"
ON public.availability_requests
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'manager'::app_role));