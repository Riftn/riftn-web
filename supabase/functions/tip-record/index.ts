/**
 * tip-record
 * ==========
 * The only writer to `public.tip_records`, the rows every tip figure is drawn
 * from: a post's tip count, a comment's tips, which comments lead a thread,
 * and a creator's income list.
 *
 * Those rows used to be inserted by the tipper's own browser. The insert
 * policy only checked that the sender column matched the caller's wallet, so
 * the amount, the receiver, the post and the comment were whatever the browser
 * said. A row could claim a tip that never happened, and that row then counted
 * everywhere a tip is shown.
 *
 * Now a caller only names a payment (`txHash`: a transaction hash, or the
 * receipt of an in-app tip). Every column of the row comes from the API's own
 * record of that payment, read back here from `GET /api/tips/receipt`. So
 * there is no login to check and nothing to forge: asking for a row to be
 * written for a real payment writes the true row, and asking for anything
 * else writes nothing.
 *
 * `commentId` is a hint for an on-chain tip, which carries its post but not
 * its comment. The API keeps it only when that comment is on that post and its
 * author is who was paid.
 *
 * POST { txHash, commentId? }
 *   200 { recorded: true }    the row is written (or already was)
 *   202 { recorded: false }   no such payment on file yet; ask again shortly
 */

import { handleCorsPreflight, jsonResponse, serviceClient } from "../_shared/auth.ts";

const API_BASE = (Deno.env.get("DEHUB_API_BASE") || "https://api.dehub.io").replace(/\/$/, "");
const RECEIPT_TIMEOUT_MS = 8_000;

const TX_HASH = /^(0x[0-9a-fA-F]{64}|app:send:0x[0-9a-f]{40}:[\w-]{8,80})$/;
const COMMENT_ID = /^[\w-]{1,64}$/;

interface Receipt {
  sender: string;
  receiver: string;
  amount: number;
  chainId: number;
  txHash: string;
  tokenId: string | null;
  commentId: string | null;
}

function isReceipt(value: any, txHash: string): value is Receipt {
  return !!value
    && typeof value.sender === "string" && typeof value.receiver === "string"
    && typeof value.amount === "number" && Number.isFinite(value.amount) && value.amount > 0
    && Number.isInteger(value.chainId)
    && value.txHash === txHash;
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid body" }, 400);
  }
  const txHash = String(body?.txHash ?? "");
  if (!TX_HASH.test(txHash)) return jsonResponse({ error: "A tip receipt is required" }, 400);
  const commentId = COMMENT_ID.test(String(body?.commentId ?? "")) ? String(body.commentId) : "";

  let receipt: unknown;
  try {
    const query = new URLSearchParams({ txHash, ...(commentId ? { commentId } : {}) });
    const res = await fetch(`${API_BASE}/api/tips/receipt?${query}`, { signal: AbortSignal.timeout(RECEIPT_TIMEOUT_MS) });
    if (res.status === 404) return jsonResponse({ recorded: false }, 202);
    if (!res.ok) throw new Error(`receipt status ${res.status}`);
    receipt = await res.json();
  } catch (err) {
    console.error("[tip-record] receipt read failed:", (err as Error)?.message);
    return jsonResponse({ error: "Could not check this tip right now" }, 502);
  }
  if (!isReceipt(receipt, txHash)) {
    console.error("[tip-record] unexpected receipt shape");
    return jsonResponse({ error: "Could not check this tip right now" }, 502);
  }

  const { error } = await serviceClient().from("tip_records").upsert({
    sender_address: receipt.sender.toLowerCase(),
    receiver_address: receipt.receiver.toLowerCase(),
    amount: receipt.amount,
    chain_id: receipt.chainId,
    tx_hash: txHash,
    token_id: receipt.tokenId ? String(receipt.tokenId) : null,
    comment_id: receipt.commentId ? String(receipt.commentId) : null,
  }, { onConflict: "tx_hash" });
  if (error) {
    console.error("[tip-record] write failed:", error.code, error.message);
    return jsonResponse({ error: "Could not save this tip right now" }, 500);
  }
  return jsonResponse({ recorded: true });
});
