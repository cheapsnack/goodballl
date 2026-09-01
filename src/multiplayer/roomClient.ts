import { supabase } from "@/integrations/supabase/client";

export type RoomRow = {
  id: string;
  code: string;
  host_club_id: string;
  guest_club_id: string | null;
  status: "waiting" | "active" | "ended";
  created_at: string;
};

/**
 * Private token proving this client is the host/guest of a room.
 * Never rendered; only sent back when ending the room.
 */
const roomTokens = new Map<string, string>();

/** Creates a new waiting room for the host via a security-definer function. */
export async function createRoom(hostClubId: string): Promise<RoomRow> {
  const { data, error } = await supabase
    .rpc("create_game_room", { p_host_club_id: hostClubId })
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not create a room right now — please try again.");
  }
  const row = data as RoomRow & { host_token: string };
  roomTokens.set(row.id, row.host_token);
  const { host_token: _t, ...rest } = row;
  return rest as RoomRow;
}

/** Joins a waiting room by code. Requires knowing the exact code — rooms can't be listed. */
export async function joinRoom(code: string, guestClubId: string): Promise<RoomRow> {
  const { data, error } = await supabase
    .rpc("join_game_room", {
      p_code: code.trim().toUpperCase(),
      p_guest_club_id: guestClubId,
    })
    .maybeSingle();

  if (error || !data) {
    throw new Error("That room code wasn't found, or the match already started.");
  }
  const row = data as RoomRow & { guest_token: string };
  roomTokens.set(row.id, row.guest_token);
  const { guest_token: _t, ...rest } = row;
  return rest as RoomRow;
}

/** Marks a room ended. Best-effort — failures here shouldn't block leaving the match. */
export async function endRoom(roomId: string): Promise<void> {
  const token = roomTokens.get(roomId);
  if (!token) return;
  try {
    await supabase.rpc("end_game_room", { p_room_id: roomId, p_token: token });
    roomTokens.delete(roomId);
  } catch {
    // Non-critical; the row is harmless left as "active".
  }
}
