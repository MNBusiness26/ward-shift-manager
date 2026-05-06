import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsErr || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);
    const callerId = claimsData.claims.sub as string;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Authorize: must be manager or assistant_manager
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const isManager = (roles ?? []).some(
      (r: any) => r.role === "manager" || r.role === "assistant_manager"
    );
    if (!isManager) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string;

    if (action === "list") {
      // Fetch all auth users (paginated)
      const pending: any[] = [];
      let page = 1;
      const perPage = 200;
      while (true) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
        if (error) return json({ error: error.message }, 500);
        const users = data?.users ?? [];
        if (users.length === 0) break;
        pending.push(...users);
        if (users.length < perPage) break;
        page++;
      }

      const ids = pending.map((u) => u.id);
      const { data: profiles } = await admin.from("profiles").select("id, is_active").in("id", ids);
      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

      const result = pending
        .filter((u) => {
          const p = profileMap.get(u.id);
          return !p || p.is_active === false;
        })
        .map((u) => ({
          id: u.id,
          email: u.email,
          full_name:
            u.user_metadata?.full_name ?? u.user_metadata?.name ?? null,
          created_at: u.created_at,
          has_profile: profileMap.has(u.id),
        }));

      // Also fetch unclaimed directory entries for the link dropdown
      const { data: directory } = await admin
        .from("staff_directory")
        .select("id, full_name, email, app_role, target_fte_percent, department")
        .eq("is_claimed", false)
        .order("full_name");

      return json({ pending: result, directory: directory ?? [] });
    }

    if (action === "link") {
      const auth_user_id = body?.auth_user_id as string;
      const directory_id = body?.directory_id as string;
      if (!auth_user_id || !directory_id) return json({ error: "Missing ids" }, 400);

      const { data: dir, error: dirErr } = await admin
        .from("staff_directory")
        .select("*")
        .eq("id", directory_id)
        .maybeSingle();
      if (dirErr || !dir) return json({ error: "Directory entry not found" }, 404);

      const { error: profErr } = await admin
        .from("profiles")
        .upsert(
          {
            id: auth_user_id,
            full_name: dir.full_name,
            email: dir.email,
            role: dir.app_role,
            target_fte_percent: dir.target_fte_percent,
            department: dir.department,
            is_active: true,
          },
          { onConflict: "id" }
        );
      if (profErr) return json({ error: profErr.message }, 500);

      const { error: roleErr } = await admin
        .from("user_roles")
        .upsert({ user_id: auth_user_id, role: dir.app_role }, { onConflict: "user_id,role" });
      if (roleErr) return json({ error: roleErr.message }, 500);

      const { error: dirUpdErr } = await admin
        .from("staff_directory")
        .update({ is_claimed: true, claimed_by: auth_user_id })
        .eq("id", directory_id);
      if (dirUpdErr) return json({ error: dirUpdErr.message }, 500);

      return json({ ok: true });
    }

    if (action === "activate") {
      const auth_user_id = body?.auth_user_id as string;
      if (!auth_user_id) return json({ error: "Missing id" }, 400);
      const { error } = await admin
        .from("profiles")
        .update({ is_active: true })
        .eq("id", auth_user_id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "dismiss") {
      const auth_user_id = body?.auth_user_id as string;
      if (!auth_user_id) return json({ error: "Missing id" }, 400);
      // Delete profile + roles first, then auth user
      await admin.from("user_roles").delete().eq("user_id", auth_user_id);
      await admin.from("profiles").delete().eq("id", auth_user_id);
      const { error } = await admin.auth.admin.deleteUser(auth_user_id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});
