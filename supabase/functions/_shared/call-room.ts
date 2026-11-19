// Calls reuse the stage caption, translation and dubbing functions.
//
// Those functions take a `spaceId` and check a stage seat. A call has no stage;
// the client passes the call's Agora room name instead — `dm-call-<call session
// id>` for a one-to-one call, `group-call-<group id>` for a group call — and
// this decides who may caption, translate and dub in it: the two people on a
// one-to-one call while it is still up, or any active member of the group.
import { serviceClient } from "./auth.ts";

export interface CallRoom {
  kind: "dm" | "group";
  id: string;
}

const CALL_ROOM = /^(dm-call|group-call)-([0-9a-fA-F-]{36})$/;

/** The call this key names, or null when it is a stage id. */
export function callRoom(key: string): CallRoom | null {
  const match = CALL_ROOM.exec(key || "");
  if (!match) return null;
  return { kind: match[1] === "dm-call" ? "dm" : "group", id: match[2] };
}

/** May this (already verified, lowercased) wallet talk in this call? */
export async function mayTalkInCall(room: CallRoom, wallet: string): Promise<boolean> {
  const admin = serviceClient();
  if (room.kind === "dm") {
    const { data: call } = await admin
      .from("call_sessions")
      .select("caller_address, recipient_address, status")
      .eq("id", room.id)
      .maybeSingle();
    if (!call || call.status === "ended") return false;
    return (
      (call.caller_address || "").toLowerCase() === wallet ||
      (call.recipient_address || "").toLowerCase() === wallet
    );
  }
  const { data: member } = await admin.rpc("is_active_group_member", {
    p_group: room.id,
    p_wallet: wallet,
  });
  return member === true;
}
