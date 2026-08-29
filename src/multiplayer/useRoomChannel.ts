import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  ROOM_EVENTS,
  type GuestInputPayload,
  type GuestJoinedPayload,
  type StateSnapshot,
} from "./types";

export type RoomHandlers = {
  onGuestJoined?: (payload: GuestJoinedPayload) => void;
  onInput?: (payload: GuestInputPayload) => void;
  onState?: (payload: StateSnapshot) => void;
  onSubscribed?: () => void;
};

export type RoomChannel = {
  sendGuestJoined: (payload: GuestJoinedPayload) => void;
  sendInput: (payload: GuestInputPayload) => void;
  sendState: (payload: StateSnapshot) => void;
};

/**
 * Subscribes to the shared `room:{code}` broadcast channel. Pass `code: null`
 * for a local single-player match and the hook stays completely inert.
 *
 * Handlers are kept in a ref so a re-render with new closures never tears down
 * and re-subscribes the channel mid-match (which would drop frames).
 */
export function useRoomChannel(code: string | null, handlers: RoomHandlers): RoomChannel {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!code) {
      channelRef.current = null;
      return;
    }

    const channel = supabase.channel(`room:${code}`, {
      config: { broadcast: { self: false, ack: false } },
    });
    channelRef.current = channel;

    channel
      .on("broadcast", { event: ROOM_EVENTS.guestJoined }, ({ payload }) =>
        handlersRef.current.onGuestJoined?.(payload as GuestJoinedPayload),
      )
      .on("broadcast", { event: ROOM_EVENTS.input }, ({ payload }) =>
        handlersRef.current.onInput?.(payload as GuestInputPayload),
      )
      .on("broadcast", { event: ROOM_EVENTS.state }, ({ payload }) =>
        handlersRef.current.onState?.(payload as StateSnapshot),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") handlersRef.current.onSubscribed?.();
      });

    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [code]);

  const send = (event: string, payload: unknown) => {
    const ch = channelRef.current;
    if (!ch) return;
    void ch.send({ type: "broadcast", event, payload });
  };

  return {
    sendGuestJoined: (payload) => send(ROOM_EVENTS.guestJoined, payload),
    sendInput: (payload) => send(ROOM_EVENTS.input, payload),
    sendState: (payload) => send(ROOM_EVENTS.state, payload),
  };
}
