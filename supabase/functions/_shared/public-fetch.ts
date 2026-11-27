// fetch() for a URL somebody else chose.
//
// A plain fetch follows redirects on its own and will happily connect to a
// loopback, link-local or private-range address, so a caller who picks the URL
// picks where this server knocks. Here every hop is checked before it is
// requested: http(s) only, default ports, no credentials in the URL, and a
// host that resolves to public addresses and nothing else.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPublicAddress(address: string): boolean {
  const h = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(h) === 4) {
    const [a, b, c] = h.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
      || (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 192 && b === 88 && c === 99)
      || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100)
      || (a === 203 && b === 0 && c === 113));
  }
  if (isIP(h) !== 6 || !/^[23][0-9a-f]{3}:/.test(h)) return false;
  if (h.startsWith("2002:") || h.startsWith("2001:db8:")) return false;
  if (h.startsWith("2001:") && parseInt(h.split(":")[1] || "0", 16) < 0x200) return false;
  return true;
}

async function assertPublic(raw: string): Promise<URL> {
  if (typeof raw !== "string" || !raw.trim() || raw.length > 8192) throw new Error("Invalid URL");
  const url = new URL(raw.trim());
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid URL");
  if (url.port && url.port !== "80" && url.port !== "443") throw new Error("URL port is not allowed");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || host === "localhost" || /\.(localhost|local|internal)$/.test(host)) throw new Error("URL host is not allowed");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address))) throw new Error("URL host is not allowed");
  return url;
}

/** Like fetch, for a caller-chosen URL. Throws when any hop is not a public web address. */
export async function fetchPublic(raw: string, init: RequestInit = {}, maxRedirects = 4): Promise<Response> {
  let target = raw;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = await assertPublic(target);
    const res = await fetch(url.toString(), { ...init, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(res.status)) return res;
    const next = res.headers.get("location");
    await res.body?.cancel();
    if (!next) throw new Error("Invalid redirect");
    target = new URL(next, url).toString();
  }
  throw new Error("Too many redirects");
}
