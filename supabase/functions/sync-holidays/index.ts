import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Map a Hebcal item into our canonical category.
 * With our query (maj=on, mod=on, i=on) we should only receive:
 *   - subcat "major"  → Jewish chag (e.g. Pesach, Sukkot, Yom Kippur)
 *   - subcat "modern" → Israeli national (e.g. Yom HaAtzmaut, Yom HaZikaron)
 *   - subcat "fast"   → Major fasts that come with majors (Tisha B'Av, Yom Kippur eve etc.)
 *   - "Erev <X>" entries when ss=on / via title prefix
 * We explicitly drop minor fasts, Rosh Chodesh, and any Diaspora-only items.
 */
function categorize(item: any): { category: "jewish" | "national"; isEve: boolean } | null {
  const title = (item.title || "").toString();
  const titleOrig = (item.title_orig || item.title || "").toString();
  const subcat = (item.subcat || "").toLowerCase();
  const cat = (item.category || "").toLowerCase();
  const isEve = /^erev\b/i.test(titleOrig) || /^erev\b/i.test(title) || subcat === "erev";

  if (cat === "roshchodesh") return null; // exclude Rosh Chodesh
  if (cat !== "holiday") return null;

  // Drop minor fasts explicitly (Tzom Gedaliah, Asarah b'Tevet, Ta'anit Esther, 17 Tammuz)
  const minorFastTitles = [
    "tzom gedaliah", "asara b'tevet", "asarah b'tevet",
    "ta'anit esther", "taanit esther", "tzom tammuz",
    "fast of gedalia", "fast of the 10th of tevet", "fast of esther",
    "fast of the 17th of tammuz",
  ];
  const tlow = titleOrig.toLowerCase();
  if (minorFastTitles.some((t) => tlow.includes(t))) return null;

  if (subcat === "modern") return { category: "national", isEve };
  if (subcat === "major" || subcat === "fast" || subcat === "erev" || subcat === "") {
    return { category: "jewish", isEve };
  }
  return null;
}

/**
 * Fetch Hebcal for one year + language.
 * Params: i=on (Israel sched), maj=on (major), mod=on (modern), ss=on (special shabbatot/erev pairs)
 * NOT included: min (minor fasts), nx (rosh chodesh), mf (minor fasts), c (candle lighting), o (omer)
 */
async function fetchHebcalYear(year: number, lang: "en" | "he") {
  const url = new URL("https://www.hebcal.com/hebcal");
  url.searchParams.set("v", "1");
  url.searchParams.set("cfg", "json");
  url.searchParams.set("year", String(year));
  url.searchParams.set("month", "x");
  url.searchParams.set("i", "on");      // Israel schedule
  url.searchParams.set("maj", "on");    // Major holidays
  url.searchParams.set("mod", "on");    // Modern Israeli national
  url.searchParams.set("ss", "on");     // Include "Erev X" entries
  url.searchParams.set("c", "off");     // No candle lighting
  url.searchParams.set("geo", "none");
  url.searchParams.set("lg", lang === "he" ? "h" : "s");
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`Hebcal ${year}/${lang}: ${r.status}`);
  const j = await r.json();
  return (j.items || []) as any[];
}

/**
 * Fetch Islamic holidays from Aladhan API (free, no key).
 * Uses Umm al-Qura calendar (Saudi Arabia, method=2) which is the standard
 * widely used reference. We extract:
 *   - Eid al-Fitr  → 1 Shawwal (month 10)
 *   - Eid al-Adha  → 10 Dhu al-Hijjah (month 12)
 *
 * Aladhan's `gToHCalendar` returns one Gregorian month at a time mapped to
 * Hijri. Cheaper: query the Hijri-to-Gregorian endpoint for the specific dates
 * across the relevant Hijri years.
 */
async function fetchMuslimHolidays(years: number[]): Promise<any[]> {
  // Determine the span of Hijri years that overlap our Gregorian span.
  // 1 Hijri year ≈ 354 days, so for each Gregorian year we need ~2 Hijri years.
  const out: any[] = [];
  const minG = Math.min(...years);
  const maxG = Math.max(...years);
  // Approximate Hijri year for a Gregorian year: H ≈ G - 622 + (G-622)/32
  const approxH = (g: number) => Math.floor(g - 622 + (g - 622) / 32);
  const startH = approxH(minG) - 1;
  const endH = approxH(maxG) + 1;

  const targets: Array<{ name_en: string; name_he: string; month: number; day: number }> = [
    { name_en: "Eid al-Fitr", name_he: "עיד אל-פיטר", month: 10, day: 1 },
    { name_en: "Eid al-Adha", name_he: "עיד אל-אדחא", month: 12, day: 10 },
  ];

  for (let h = startH; h <= endH; h++) {
    for (const t of targets) {
      const url = `https://api.aladhan.com/v1/hToG/${t.day}-${t.month}-${h}`;
      try {
        const r = await fetch(url);
        if (!r.ok) continue;
        const j = await r.json();
        const greg = j?.data?.gregorian;
        if (!greg?.date) continue;
        // greg.date is "DD-MM-YYYY" → convert to YYYY-MM-DD
        const [dd, mm, yyyy] = String(greg.date).split("-");
        const isoDate = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
        const yearNum = Number(yyyy);
        if (!years.includes(yearNum)) continue;
        const uid = `aladhan:${isoDate}:${t.name_en.toLowerCase().replace(/\s+/g, "_")}`;
        out.push({
          hebcal_uid: uid,
          date: isoDate,
          name_en: t.name_en,
          name_he: t.name_he,
          category: "muslim",
          is_eve: false,
          source: "aladhan",
          region: "IL",
        });
      } catch (err) {
        console.warn(`Aladhan fetch failed ${t.name_en} ${t.day}-${t.month}-${h}:`, err);
      }
    }
  }
  return out;
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
    const years = [startYear, endYear];

    // ---------- Hebcal: Jewish + National ----------
    const items: Record<string, any> = {};
    for (const y of years) {
      const en = await fetchHebcalYear(y, "en");
      const he = await fetchHebcalYear(y, "he");
      const heByKey: Record<string, string> = {};
      for (const it of he) {
        if (it.date) heByKey[`${it.date}|${(it.title_orig || it.title).toLowerCase()}`] = it.hebrew || it.title;
      }
      for (const it of en) {
        if (!it.date) continue;
        const cat = categorize(it);
        if (!cat) continue; // filtered out (minor fast, rosh chodesh, etc)
        const date = String(it.date).slice(0, 10);
        const titleEn = it.title;
        const titleOrig = (it.title_orig || it.title).toLowerCase();
        const nameHe = heByKey[`${it.date}|${titleOrig}`] || it.hebrew || titleEn;
        const uid = `hebcal:${date}:${titleOrig}`;
        items[uid] = {
          hebcal_uid: uid,
          date,
          name_en: titleEn,
          name_he: nameHe,
          category: cat.category,
          is_eve: cat.isEve,
          source: "hebcal",
          region: "IL",
        };
      }
    }

    // ---------- Muslim holidays (Eid al-Fitr & Eid al-Adha) ----------
    const muslimRows = await fetchMuslimHolidays(years);
    for (const m of muslimRows) items[m.hebcal_uid] = m;

    const rows = Object.values(items);

    // Preserve manager-set `is_active=false` overrides
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

    const muslimCount = muslimRows.length;
    const hebcalCount = rows.length - muslimCount;
    return new Response(
      JSON.stringify({
        success: true,
        upserted,
        years,
        breakdown: { hebcal: hebcalCount, muslim: muslimCount },
      }),
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
