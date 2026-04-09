
-- Create enums
CREATE TYPE public.app_role AS ENUM ('nurse', 'assistant', 'manager');
CREATE TYPE public.shift_type AS ENUM ('morning', 'evening', 'night');
CREATE TYPE public.request_status AS ENUM ('pending', 'approved', 'declined');
CREATE TYPE public.swap_status AS ENUM ('pending', 'peer_accepted', 'manager_approved', 'denied');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT false,
  target_fte_percent NUMERIC(3,2) NOT NULL DEFAULT 1.0,
  constraints JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create shifts table
CREATE TABLE public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  type shift_type NOT NULL,
  assigned_user_id UUID REFERENCES public.profiles(id),
  is_responsible_on_shift BOOLEAN NOT NULL DEFAULT false,
  is_draft BOOLEAN NOT NULL DEFAULT true,
  manager_on_duty_id UUID REFERENCES public.profiles(id),
  color_code TEXT,
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

-- Create availability_requests table
CREATE TABLE public.availability_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status request_status NOT NULL DEFAULT 'pending',
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.availability_requests ENABLE ROW LEVEL SECURITY;

-- Create swap_requests table
CREATE TABLE public.swap_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requesting_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  covering_user_id UUID REFERENCES public.profiles(id),
  is_pool_request BOOLEAN NOT NULL DEFAULT false,
  shift_id UUID NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  status swap_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.swap_requests ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Security definer function to check if user is active
CREATE OR REPLACE FUNCTION public.is_active_user(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND is_active = true
  )
$$;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_shifts_updated_at BEFORE UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_availability_requests_updated_at BEFORE UPDATE ON public.availability_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_swap_requests_updated_at BEFORE UPDATE ON public.swap_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, ''));
  -- Default role: nurse
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'nurse');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies

-- Profiles: all authenticated can read active profiles, users edit own
CREATE POLICY "Anyone authenticated can view profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "System can insert profiles" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- User roles: viewable by self and managers
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Managers can view all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Managers can manage roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'manager'));

-- Shifts: active users see published shifts, managers see all
CREATE POLICY "Active users can view published shifts" ON public.shifts
  FOR SELECT TO authenticated USING (
    (NOT is_draft AND public.is_active_user(auth.uid()))
    OR public.has_role(auth.uid(), 'manager')
  );
CREATE POLICY "Managers can manage shifts" ON public.shifts
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'manager'));

-- Availability requests: users manage own, managers see all
CREATE POLICY "Users can view own availability requests" ON public.availability_requests
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own availability requests" ON public.availability_requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own pending requests" ON public.availability_requests
  FOR UPDATE TO authenticated USING (auth.uid() = user_id AND status = 'pending');
CREATE POLICY "Users can delete own pending requests" ON public.availability_requests
  FOR DELETE TO authenticated USING (auth.uid() = user_id AND status = 'pending');
CREATE POLICY "Managers can view all availability requests" ON public.availability_requests
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Managers can update availability requests" ON public.availability_requests
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'manager'));

-- Swap requests: involved users + managers
CREATE POLICY "Users can view own swap requests" ON public.swap_requests
  FOR SELECT TO authenticated USING (
    auth.uid() = requesting_user_id
    OR auth.uid() = covering_user_id
  );
CREATE POLICY "Users can view pool requests" ON public.swap_requests
  FOR SELECT TO authenticated USING (is_pool_request = true AND public.is_active_user(auth.uid()));
CREATE POLICY "Users can create swap requests" ON public.swap_requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = requesting_user_id);
CREATE POLICY "Covering user can accept swap" ON public.swap_requests
  FOR UPDATE TO authenticated USING (
    auth.uid() = covering_user_id
    OR (is_pool_request = true AND public.is_active_user(auth.uid()))
  );
CREATE POLICY "Managers can manage all swap requests" ON public.swap_requests
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'manager'));

-- Indexes for performance
CREATE INDEX idx_shifts_date ON public.shifts(date);
CREATE INDEX idx_shifts_assigned_user ON public.shifts(assigned_user_id);
CREATE INDEX idx_shifts_type ON public.shifts(type);
CREATE INDEX idx_availability_user_date ON public.availability_requests(user_id, date);
CREATE INDEX idx_swap_requesting_user ON public.swap_requests(requesting_user_id);
CREATE INDEX idx_swap_shift ON public.swap_requests(shift_id);
