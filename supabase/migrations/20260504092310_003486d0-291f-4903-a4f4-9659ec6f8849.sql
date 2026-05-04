-- Add 'preference' to availability_type enum
ALTER TYPE public.availability_type ADD VALUE IF NOT EXISTS 'preference';
