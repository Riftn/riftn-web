import { handleCorsPreflight, jsonResponse, serviceClient } from "../_shared/auth.ts";

const periods = new Set(["day", "week", "month", "year"]);
interface RankedAccount { account: string }
interface Visibility { address: string; followerCountVisible?: boolean; isBanned?: boolean }

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "Use POST" }, 405);
  const period = (await req.json().catch(() => null))?.period;
  if (!periods.has(period)) return jsonResponse({ error: "Unknown ranking period" }, 400);

  try {
    const { data, error } = await serviceClient().from("leaderboard_cache")
      .select("data").eq("sort_mode", "followers").eq("period", period).maybeSingle();
    if (error) throw error;
    const board = data?.data;
    const rows: RankedAccount[] = board?.result?.byWalletBalance ?? [];
    const visible = new Set<string>();
    for (let i = 0; i < rows.length; i += 100) {
      const addresses = rows.slice(i, i + 100).map(row => row.account);
      const response = await fetch("https://api.dehub.io/api/account_info/batch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses }), signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) throw new Error("Profile visibility lookup failed");
      const { result } = await response.json() as { result: Visibility[] };
      for (const profile of result) {
        if (profile.followerCountVisible === true && !profile.isBanned) visible.add(profile.address.toLowerCase());
      }
    }
    const result = jsonResponse({
      result: { byWalletBalance: rows.filter(row => visible.has(row.account.toLowerCase())) },
      hasHistoricalData: board?.hasHistoricalData ?? Boolean(board),
    });
    result.headers.set("Cache-Control", "no-store");
    return result;
  } catch {
    return jsonResponse({ error: "Follower rankings are temporarily unavailable" }, 503);
  }
});
