import { supabase } from "@/integrations/supabase/client";

/** Characters chosen to avoid look-alikes (no 0/O, 1/I) when read aloud or typed. */
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(len = 5): string {
  return Array.from({ length: len }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(
    "",
  );
}

export type RoomRow = {
  id: string;
  code: string;
  host_club_id: string;
  guest_club_id: string | null;
  status: "waiting" | "active" | "ended";
  created_at: string;
};

/** Creates a new waiting room for the host, retrying on the rare code collision. */
export async function createRoom(hostClubId: string): Promise<RoomRow> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const { data, error } = await supabase
      .from("game_rooms")
      .insert({ code, host_club_id: hostClubId, status: "waiting" })
      .select()
      .single();

    if (!error && data) return data as RoomRow;
    // 23505 = unique_violation on the code column — just try a new code.
    if (error && (error as { code?: string }).code !== "23505") {
      throw new Error(error.message);
    }
  }
  throw new Error("Could not create a room right now — please try again.");
}

/** Looks up a waiting room by code and marks it active with the guest's club. */
export async function joinRoom(code: string, guestClubId: string): Promise<RoomRow> {
  const normalized = code.trim().toUpperCase();

  const { data: room, error: findError } = await supabase
    .from("game_rooms")
    .select("*")
    .eq("code", normalized)
    .eq("status", "waiting")
    .maybeSingle();

  if (findError) throw new Error(findError.message);
  if (!room) throw new Error("That room code wasn't found, or the match already started.");

  const { data: updated, error: updateError } = await supabase
    .from("game_rooms")
    .update({ guest_club_id: guestClubId, status: "active" })
    .eq("id", (room as RoomRow).id)
    .select()
    .single();

  if (updateError || !updated) {
    throw new Error(updateError?.message ?? "Could not join that room — please try again.");
  }
  return updated as RoomRow;
}

/** Marks a room ended. Best-effort — failures here shouldn't block leaving the match. */
export async function endRoom(roomId: string): Promise<void> {
  try {
    await supabase.from("game_rooms").update({ status: "ended" }).eq("id", roomId);
  } catch {
    // Non-critical; the row is harmless left as "active".
  }
}
