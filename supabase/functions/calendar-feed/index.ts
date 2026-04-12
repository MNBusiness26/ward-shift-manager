import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response("Missing token", { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Look up user by calendar_token
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("calendar_token", token)
    .single();

  if (profileError || !profile) {
    return new Response("Invalid token", { status: 403 });
  }

  // Fetch all published shifts for this user
  const { data: shifts, error: shiftsError } = await supabase
    .from("shifts")
    .select("id, date, type, start_time, end_time, is_responsible_on_shift, is_standby, assigned_user_id, updated_at")
    .eq("assigned_user_id", profile.id)
    .eq("is_draft", false)
    .order("date");

  if (shiftsError) {
    return new Response("Error fetching shifts", { status: 500 });
  }

  // Also fetch colleagues for each shift to include in description
  const shiftDates = [...new Set((shifts || []).map((s: any) => s.date))];
  let allColleagues: any[] = [];
  if (shiftDates.length > 0) {
    const { data } = await supabase
      .from("shifts")
      .select("date, type, assigned_user_id, profiles:assigned_user_id(full_name)")
      .eq("is_draft", false)
      .neq("assigned_user_id", profile.id)
      .in("date", shiftDates);
    allColleagues = data || [];
  }

  const shiftLabels: Record<string, string> = {
    morning: "Morning",
    evening: "Evening",
    night: "Night",
  };

  const events = (shifts || []).map((s: any) => {
    const dateClean = s.date.replace(/-/g, "");
    const startH = s.start_time.slice(0, 2);
    const startM = s.start_time.slice(3, 5);
    const endH = s.end_time.slice(0, 2);
    const endM = s.end_time.slice(3, 5);

    let endDate = dateClean;
    if (parseInt(endH) < parseInt(startH)) {
      const d = new Date(s.date);
      d.setDate(d.getDate() + 1);
      endDate = d.toISOString().slice(0, 10).replace(/-/g, "");
    }

    // Compute SEQUENCE from updated_at (seconds since epoch, mod for reasonable int)
    const updatedMs = new Date(s.updated_at).getTime();
    const sequence = Math.floor(updatedMs / 1000) % 1000000;

    const colleagues = allColleagues
      .filter((c: any) => c.date === s.date && c.type === s.type)
      .map((c: any) => c.profiles?.full_name || "Unknown");

    const teamList = colleagues.length > 0 ? `\\nTeam: ${colleagues.join(", ")}` : "";
    const label = shiftLabels[s.type] || s.type;
    const desc = `${label} Shift${s.is_responsible_on_shift ? " (Responsible)" : ""}${s.is_standby ? " (Stand-by)" : ""}${teamList}`;

    return [
      "BEGIN:VEVENT",
      `UID:${s.id}@wardwise`,
      `SEQUENCE:${sequence}`,
      `DTSTART:${dateClean}T${startH}${startM}00`,
      `DTEND:${endDate}T${endH}${endM}00`,
      `SUMMARY:${label} Shift${s.is_responsible_on_shift ? " ★" : ""}`,
      `DESCRIPTION:${desc}`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
      "END:VEVENT",
    ].join("\r\n");
  });

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WardWise//Shifts//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:WardWise - ${profile.full_name}`,
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="wardwise-shifts.ics"`,
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
});
