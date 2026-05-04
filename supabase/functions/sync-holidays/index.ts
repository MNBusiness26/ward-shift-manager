import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Map Hebcal categories/flags into our canonical categories
function categorize(item: any): { category: string; isEve: boolean } {
  const title = (item.title || "").toLowerCase();
  const subcat = (item.subcat || "").toLowerCase();
  const cat = (item.category || "").toLowerCase();
  const isEve = title.startsWith("erev ") || subcat === "erev";

  if (cat === "holiday") {
    if (subcat === "major" || subcat === "minor" || subcat === "modern" || subcat === "fast" || subcat === "erev") {
      // Modern Israeli national holidays
      if (subcat === "modern") return { category: "national", isEve };
      return { category: "jewish", isEve };
    }
    return { category: "jewish", isEve };
  }
  if (cat === "roshchodesh") return { category: "jewish", isEve };
  return { category: "jewish", isEve };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const startYear = now.getFullYear();
    const endYear = startYear + 1;

    // Fetch English + Hebrew in two passes
    const fetchYear = async (year: number, lang: "en" | "he") => {
      const url = `https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=on&mod=on&nx=on&year=${year}&month=x&ss=on&mf=on&c=off&geo=none&lg=${lang === "he" ? "h" : "s"}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Hebcal ${year}/${lang}: ${r.status}`);
      const j = await r.json();
      return j.items || [];
    };

    const items: Record<string, any> = {};
    for (const y of [startYear, endYear]) {
      const en = await fetchYear(y, "en");
      const he = await fetchYear(y, "he");
      const heByDateTitle: Record<string, string> = {};
      for (const it of he) {
        // Hebcal `hebrew` field has the Hebrew name
        if (it.date) heByDateTitle[`${it.date}|${(it.title_orig || it.title).toLowerCase()}`] = it.hebrew || it.title;
      }
      for (const it of en) {
        if (!it.date) continue;
        const date = String(it.date).slice(0, 10);
        const titleEn = it.title;
        const titleOrig = (it.title_orig || it.title).toLowerCase();
        const nameHe = heByDateTitle[`${it.date}|${titleOrig}`] || it.hebrew || titleEn;
        const { category, isEve } = categorize(it);
        const uid = `hebcal:${date}:${titleOrig}`;
        items[uid] = {
          hebcal_uid: uid,
          date,
          name_en: titleEn,
          name_he: nameHe,
          category,
          is_eve: isEve,
          source: "hebcal",
          region: "IL",
        };
      }
    }

    const rows = Object.values(items);

    // Upsert; preserve `is_active` overrides if a manager has blocked one
    const { data: existing } = await admin
      .from("public_holidays")
      .select("hebcal_uid,is_active")
      .in("hebcal_uid", rows.map((r: any) => r.hebcal_uid));
    const inactiveSet = new Set(
      (existing || []).filter((e: any) => e.is_active === false).map((e: any) => e.hebcal_uid),
    );

    const payload = rows.map((r: any) => ({
      ...r,
      is_active: inactiveSet.has(r.hebcal_uid) ? false : true,
    }));

    // Upsert in chunks
    const chunkSize = 200;
    let upserted = 0;
    for (let i = 0; i < payload.length; i += chunkSize) {
      const chunk = payload.slice(i, i + chunkSize);
      const { error } = await admin
        .from("public_holidays")
        .upsert(chunk, { onConflict: "hebcal_uid" });
      if (error) throw error;
      upserted += chunk.length;
    }

    return new Response(
      JSON.stringify({ success: true, upserted, years: [startYear, endYear] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("sync-holidays error:", e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
