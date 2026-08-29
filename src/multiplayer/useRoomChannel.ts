import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { GuestInputPayload, GuestJoinedPayload, MatchSnapshot } from "./types";

type Handlers = {
  onGuestJoined?: (payload: GuestJoinedPayload) => void;
  onInput?: (payload: GuestInputPayload) => void;
  onState?: (payload: MatchSnapshot) => void;
  /** Fires once the channel has actually joined the realtime socket. */
  onSubscribed?: () => void;
};

/**
 * One realtime broadcast channel per room code, shared by host and guest.
 * Broadcast (not Postgres change events) — ephemeral, low-latency, and
 * needs no replication setup on the table. Handlers are kept in a ref so
 * callers can pass fresh closures every render without resubscribing.
 */
export function useRoomChannel(code: string | null, handlers: Handlers) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!code) return;

    const channel = supabase.channel(`room:${code}`, {
      config: { broadcast: { self: false, ack: false } },
    });

    channel
      .on("broadcast", { event: "guest_joined" }, ({ payload }) =>
        handlersRef.current.onGuestJoined?.(payload as GuestJoinedPayload),
      )
      .on("broadcast", { event: "input" }, ({ payload }) =>
        handlersRef.current.onInput?.(payload as GuestInputPayload),
      )
      .on("broadcast", { event: "state" }, ({ payload }) =>
        handlersRef.current.onState?.(payload as MatchSnapshot),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") handlersRef.current.onSubscribed?.();
      });

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [code]);

  const sendGuestJoined = (payload: GuestJoinedPayload) => {
    channelRef.current?.send({ type: "broadcast", event: "guest_joined", payload });
  };
  const sendInput = (payload: GuestInputPayload) => {
    channelRef.current?.send({ type: "broadcast", event: "input", payload });
  };
  const sendState = (payload: MatchSnapshot) => {
    channelRef.current?.send({ type: "broadcast", event: "state", payload });
  };

  return { sendGuestJoined, sendInput, sendState };
}
