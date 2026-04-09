CREATE POLICY "Users can delete own pending swap requests"
ON public.swap_requests
FOR DELETE
TO authenticated
USING (
  auth.uid() = requesting_user_id
  AND status IN ('pending', 'peer_accepted')
);