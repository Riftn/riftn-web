// Cast, change or withdraw a vote on a governance proposal.
//
// Two things used to be taken from the caller and are now taken from the
// server: who is voting, and how much their vote is worth.
//
//   · Identity comes from `requireDeHubAuth`, which resolves the wallet from a
//     verified Riftn token. The old path wrote straight to PostgREST under an
//     RLS policy that compared `wallet_address` to the caller's own
//     `x-wallet-address` header — an unsigned string, so any address could be
//     claimed and anyone's vote could be deleted.
//   · Weight comes from `resolveVoteWeight`, which reads the badge balance the
//     API holds for that wallet. It used to arrive in the request body.
//
// Writes go through the service role because the vote table no longer grants
// INSERT/UPDATE/DELETE to anyone else. Tallies stay where they were: the
// `on_governance_vote_change` trigger re-sums the table after every write.
//
// A multiple choice proposal (one with `options`) takes `optionIndex` instead
// of a side: the answer picked, 0-based. It is stored as a vote_type 1 row
// with that index, and picking the same answer again withdraws it.

import { handleCorsPreflight, jsonResponse, guardPaidEndpoint, serviceClient } from "../_shared/auth.ts";
import { resolveVoteWeight } from "../_shared/badge-weight.ts";

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  // Generous enough that no real voter meets it, tight enough that scripted
  // vote-churn cannot be used to spam proposal authors with notifications.
  const auth = await guardPaidEndpoint(req, "governance-vote", { limit: 60, windowMs: 60 * 60 * 1000 });
  if (!auth.ok) return auth.response;
  const wallet = auth.wallet;

  let body: { proposalId?: unknown; voteType?: unknown; optionIndex?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request body." }, 400);
  }

  const proposalId = typeof body.proposalId === "string" ? body.proposalId : "";
  const voteType = body.voteType;
  if (!/^[0-9a-f-]{36}$/i.test(proposalId)) return jsonResponse({ error: "A proposal id is required." }, 400);
  const optionIndex = body.optionIndex === undefined || body.optionIndex === null ? null : body.optionIndex;
  if (optionIndex !== null && (typeof optionIndex !== "number" || !Number.isInteger(optionIndex) || optionIndex < 0)) {
    return jsonResponse({ error: "optionIndex must be a whole number." }, 400);
  }
  if (optionIndex === null && voteType !== 1 && voteType !== -1 && voteType !== 0) {
    return jsonResponse({ error: "voteType must be 1, -1 or 0." }, 400);
  }

  const supabase = serviceClient();

  const { data: proposal, error: lookupError } = await supabase
    .from("governance_proposals")
    .select("*")
    .eq("id", proposalId)
    .maybeSingle();
  if (lookupError) {
    console.error("governance-vote: proposal lookup failed", lookupError);
    return jsonResponse({ error: "Could not read that proposal." }, 500);
  }
  if (!proposal) return jsonResponse({ error: "That proposal no longer exists." }, 404);

  // A decided proposal is a record, not a poll. Withdrawing is refused too —
  // letting a voter pull their weight out after the verdict would rewrite the
  // tally the verdict was read from.
  const closed = proposal.status !== "open"
    || (proposal.voting_ends_at ? Date.parse(proposal.voting_ends_at) <= Date.now() : false);
  if (closed) return jsonResponse({ error: "Voting on this proposal has closed." }, 409);

  const options: string[] | null = Array.isArray(proposal.options) && proposal.options.length > 0
    ? proposal.options
    : null;
  if (options) {
    if (optionIndex === null && voteType !== 0) {
      return jsonResponse({ error: "Pick one of the answers to vote." }, 400);
    }
    if (optionIndex !== null && optionIndex >= options.length) {
      return jsonResponse({ error: "That answer isn't on this proposal." }, 400);
    }
  } else if (optionIndex !== null) {
    return jsonResponse({ error: "This proposal is a yes or no vote." }, 400);
  }

  // Clicking the side you already voted for withdraws the vote. That toggle is
  // decided here, against the stored row, rather than from the client's idea
  // of its own current vote — which is a render behind and, when it was wrong,
  // turned a withdrawal into a re-vote.
  const { data: existing } = await supabase
    .from("governance_votes")
    .select(options ? "vote_type, option_index" : "vote_type")
    .eq("proposal_id", proposalId)
    .eq("wallet_address", wallet)
    .maybeSingle();

  const withdrawing = options
    ? voteType === 0 || optionIndex === null
      || (existing as { option_index?: number | null } | null)?.option_index === optionIndex
    : voteType === 0 || existing?.vote_type === voteType;

  if (withdrawing) {
    const { error } = await supabase
      .from("governance_votes")
      .delete()
      .eq("proposal_id", proposalId)
      .eq("wallet_address", wallet);
    if (error) {
      console.error("governance-vote: delete failed", error);
      return jsonResponse({ error: "Could not withdraw that vote." }, 500);
    }
    return jsonResponse({ success: true, action: "removed", weight: 0, badgeName: null });
  }

  const { weight, badgeName, lent } = await resolveVoteWeight(wallet, false, { ownOnly: true });
  if (weight <= 0) {
    // `code` lets the apps swap in their own wording and a Buy DHB button.
    return lent
      ? jsonResponse({
        error: "Your badge is lent to you, and lent badges can't vote. Buy DHB to earn your own badge.",
        code: "LENT_BADGE",
      }, 403)
      : jsonResponse({ error: "You need a staking badge to vote. Buy DHB to earn one.", code: "NO_BADGE" }, 403);
  }

  const { error } = await supabase
    .from("governance_votes")
    .upsert(
      {
        proposal_id: proposalId,
        wallet_address: wallet,
        vote_type: options ? 1 : voteType,
        vote_weight: weight,
        badge_name: badgeName,
        // Only on multiple choice rows, so yes/no votes never touch the column.
        ...(options ? { option_index: optionIndex } : {}),
      },
      { onConflict: "proposal_id,wallet_address" },
    );
  if (error) {
    console.error("governance-vote: upsert failed", error);
    return jsonResponse({ error: "Could not record that vote." }, 500);
  }

  return jsonResponse({
    success: true,
    action: "voted",
    weight,
    badgeName,
    ...(options ? { optionIndex } : {}),
  });
});
