

# WardWise Scheduler — Implementation Plan

## Phase 1: Foundation & Auth
- **Database Schema**: Create all tables (profiles, shifts, availability_requests, swap_requests) with proper relationships, enums for roles/shift types/statuses, and RLS policies
- **User Roles Table**: Separate `user_roles` table with `app_role` enum (nurse, assistant, manager) and `has_role()` security definer function
- **Authentication**: Google OAuth + Email/Password via Supabase Auth. New signups default to `is_active = false` (pending state). Auth gate blocks inactive users from accessing the app
- **Profile Setup**: Auto-create profile on signup via DB trigger. Store `full_name`, `target_fte_percent`, `constraints` (JSON), `is_active`
- **Design System**: Cerulean Blue (#345AC7) primary, Vivid Red (#ED1B24) alerts, Mercury Gray (#E8E8E8) borders, Mine Shaft (#232323) text. Professional medical theme with clean typography

## Phase 2: Nurse Experience (Mobile-First)
- **Dashboard**: Upcoming 7-day shift view with toggle to agenda (stacked list). Shows shift type (M/E/N) with color coding, teammates, responsible nurse, and manager on duty
- **Personal Calendar**: Monthly/weekly views. Click any shift to see details modal (manager, teammates, responsible nurse). Color-coded by shift type
- **Availability Management**: Monthly calendar to block dates. Submit blocking requests with reason. Status badges (pending/approved/declined). Approved blocks visually marked on personal calendar
- **Swap Requests**: From any assigned shift, initiate swap — choose "Direct Request" (pick a colleague) or "Pool Offer" (visible to all eligible). Conflict checking prevents accepting swaps on already-assigned slots
- **Personal Stats Area**: Shift counts (total, by type M/E/N), completed vs. booked, contract fulfillment gauge using formula: `(Assigned / (5 × FTE%)) × 100`

## Phase 3: Manager Experience (Desktop-Optimized)
- **Master Roster**: Full ward schedule grid view — all employees × all dates. Drag-and-drop or click-to-assign shifts. Designate "Responsible Nurse" per shift. Visual flags for shifts missing a responsible nurse
- **Draft Mode**: Create and save work-in-progress schedules (`is_draft = true`). Publish button pushes drafts live to nurses' calendars
- **Request Management Dashboard**: Unified queue for swap requests (after peer acceptance) and availability blocking requests. Approve/deny with one click. Auto-updates roster on approval
- **Shift Planning Tools**: Create shifts weeks in advance. Guardrails: prevent assignment on approved blocked days (with override option), configurable minimum rest periods between shifts, respect individual constraints (no nights, no weekends)
- **Analytics & Reporting**: Hours worked per employee (weekly/monthly), shift distribution charts, fulfillment percentages per nurse with visual indicators

## Phase 4: Business Logic & Guardrails
- **Swap Flow Engine**: Full lifecycle — Initiation → Peer Accept/Claim → Manager Queue → Finalization with roster auto-update
- **Scheduling Validation**: Rest period rules, blocked day enforcement, individual constraint checks, responsible nurse requirement per shift
- **Nurse Pool**: Shared board for pool swap offers. Eligible nurses can claim. Eligibility filtered by conflicts and constraints
- **Manager Activation Flow**: Manager dashboard to view pending signups and activate/deactivate profiles

## Technical Architecture
- **Supabase Auth** with Google + Email/Password
- **Lovable Cloud** for backend (edge functions for complex validation)
- **RLS Policies**: Nurses see all approved shifts, edit only own availability. Managers have full roster control. Draft shifts visible only to managers
- **Responsive Layout**: Mobile-first nurse views, desktop-optimized manager views with sidebar navigation

