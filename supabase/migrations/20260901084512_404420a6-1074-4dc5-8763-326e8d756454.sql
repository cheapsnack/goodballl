ALTER TABLE public.game_rooms
  ADD COLUMN IF NOT EXISTS host_token uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS guest_token uuid;

DROP POLICY IF EXISTS "anyone can create a room" ON public.game_rooms;
DROP POLICY IF EXISTS "anyone can read rooms" ON public.game_rooms;
DROP POLICY IF EXISTS "anyone can update rooms" ON public.game_rooms;

REVOKE ALL ON public.game_rooms FROM anon, authenticated;
GRANT ALL ON public.game_rooms TO service_role;

ALTER TABLE public.game_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no direct access to game rooms"
  ON public.game_rooms FOR SELECT USING (false);

CREATE OR REPLACE FUNCTION public.create_game_room(p_host_club_id text)
RETURNS TABLE (id uuid, code text, host_club_id text, guest_club_id text, status text, created_at timestamptz, host_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  new_code text;
  i int;
  attempt int;
BEGIN
  FOR attempt IN 1..8 LOOP
    new_code := '';
    FOR i IN 1..5 LOOP
      new_code := new_code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    END LOOP;
    BEGIN
      RETURN QUERY
      INSERT INTO public.game_rooms (code, host_club_id, status)
      VALUES (new_code, p_host_club_id, 'waiting')
      RETURNING game_rooms.id, game_rooms.code, game_rooms.host_club_id, game_rooms.guest_club_id,
                game_rooms.status, game_rooms.created_at, game_rooms.host_token;
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;
  RAISE EXCEPTION 'Could not allocate a room code';
END;
$$;

CREATE OR REPLACE FUNCTION public.join_game_room(p_code text, p_guest_club_id text)
RETURNS TABLE (id uuid, code text, host_club_id text, guest_club_id text, status text, created_at timestamptz, guest_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token uuid := gen_random_uuid();
BEGIN
  RETURN QUERY
  UPDATE public.game_rooms g
     SET guest_club_id = p_guest_club_id,
         status = 'active',
         guest_token = v_token
   WHERE g.code = upper(trim(p_code))
     AND g.status = 'waiting'
  RETURNING g.id, g.code, g.host_club_id, g.guest_club_id, g.status, g.created_at, g.guest_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found or already started';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_game_room(p_room_id uuid, p_token uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.game_rooms
     SET status = 'ended'
   WHERE id = p_room_id
     AND (host_token = p_token OR guest_token = p_token);
$$;

REVOKE ALL ON FUNCTION public.create_game_room(text) FROM public;
REVOKE ALL ON FUNCTION public.join_game_room(text, text) FROM public;
REVOKE ALL ON FUNCTION public.end_game_room(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.create_game_room(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_game_room(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_game_room(uuid, uuid) TO anon, authenticated;