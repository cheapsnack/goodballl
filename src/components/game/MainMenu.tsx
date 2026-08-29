import { useRef, useState } from "react";
import { initAudio, isAudioEnabled, setAudioEnabled } from "../../game/logic/audio";
import { MATCH_TUNING } from "../../game/logic/match";
import { CLUBS, DEFAULT_AWAY_CLUB_ID, DEFAULT_HOME_CLUB_ID } from "../../game/data/clubs";
import { DIFFICULTY_LABEL, type Difficulty } from "../../game/logic/ai/difficulty";
import { useGameStore } from "../../game/store/useGameStore";
import { createRoom, joinRoom } from "../../multiplayer/roomClient";
import { useRoomChannel } from "../../multiplayer/useRoomChannel";

type Mode = "ai" | "local2p" | "friend";
type FriendStep = "choose" | "create-waiting" | "join-form" | "connecting";
const DIFFICULTIES: Difficulty[] = ["beginner", "amateur", "advanced", "expert"];

/**
 * Pre-match screen. Rendered instead of the Canvas so nothing simulates (and
 * no WebGL context is created) until the player commits — this also gives us
 * the user gesture WebAudio needs before it will make a sound.
 */
export function MainMenu({ onKickoff }: { onKickoff: () => void }) {
  const [sound, setSound] = useState(isAudioEnabled());
  const [homeId, setHomeId] = useState(DEFAULT_HOME_CLUB_ID);
  const [awayId, setAwayId] = useState(DEFAULT_AWAY_CLUB_ID);
  const setClubs = useGameStore((s) => s.setClubs);
  const setNetRoom = useGameStore((s) => s.setNetRoom);
  const difficulty = useGameStore((s) => s.difficulty);
  const setDifficulty = useGameStore((s) => s.setDifficulty);

  const [mode, setMode] = useState<Mode>("ai");
  const [friendStep, setFriendStep] = useState<FriendStep>("choose");
  const [roomCode, setRoomCode] = useState("");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** Which of the two DB flows we're mid-way through, so the shared onSubscribed handler knows what to do. */
  const [pendingAction, setPendingAction] = useState<"create" | "join" | null>(null);
  /** The channel needs a code to subscribe to; null keeps it fully inert until one exists. */
  const [channelCode, setChannelCode] = useState<string | null>(null);
  /** Host's room id, needed once the guest joins — not rendered, so a ref, not state. */
  const hostRoomId = useRef<string | null>(null);

  const channel = useRoomChannel(channelCode, {
    onGuestJoined: (payload) => {
      // Host side: the guest has joined and told us their club — start the match.
      if (sound) initAudio();
      setAudioEnabled(sound);
      setClubs(homeId, payload.guestClubId);
      setNetRoom("host", channelCode, hostRoomId.current);
      onKickoff();
    },
    onSubscribed: async () => {
      if (pendingAction !== "join") return;
      // Guest side: channel is live, now actually claim the room in the DB.
      try {
        const room = await joinRoom(joinCodeInput, homeId);
        channel.sendGuestJoined({ guestClubId: homeId });
        if (sound) initAudio();
        setAudioEnabled(sound);
        setClubs(room.host_club_id, homeId);
        setNetRoom("guest", room.code, room.id);
        onKickoff();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not join that room.");
        setFriendStep("join-form");
        setChannelCode(null);
        setPendingAction(null);
      }
    },
  });

  const startVsAi = () => {
    if (sound) initAudio();
    setAudioEnabled(sound);
    setClubs(homeId, awayId === homeId ? DEFAULT_AWAY_CLUB_ID : awayId);
    setNetRoom("local", null, null);
    onKickoff();
  };

  const startLocal2P = () => {
    if (sound) initAudio();
    setAudioEnabled(sound);
    setClubs(homeId, awayId === homeId ? DEFAULT_AWAY_CLUB_ID : awayId);
    setNetRoom("local2p", null, null);
    onKickoff();
  };

  const startCreateRoom = async () => {
    setError(null);
    setFriendStep("connecting");
    setPendingAction("create");
    try {
      const room = await createRoom(homeId);
      hostRoomId.current = room.id;
      setRoomCode(room.code);
      setChannelCode(room.code); // subscribes; onGuestJoined fires once someone joins
      setFriendStep("create-waiting");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create a room.");
      setFriendStep("choose");
      setPendingAction(null);
    }
  };

  const startJoinRoom = () => {
    if (joinCodeInput.trim().length < 4) {
      setError("Enter the room code your friend shared.");
      return;
    }
    setError(null);
    setPendingAction("join");
    setFriendStep("connecting");
    setChannelCode(joinCodeInput.trim().toUpperCase()); // triggers onSubscribed above
  };

  const cancelFriendFlow = () => {
    setFriendStep("choose");
    setChannelCode(null);
    setPendingAction(null);
    setError(null);
  };

  const minutes = Math.round((MATCH_TUNING.periodSeconds * MATCH_TUNING.periods) / 60);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center overflow-y-auto bg-[#0d1a12] text-background">
      {/* Faint pitch stripes behind the panel keep the sports feel pre-kickoff. */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, #2f7a3f 0 60px, #256533 60px 120px)",
        }}
      />
      <div className="relative w-full max-w-md px-8 py-10 text-center">
        <div className="text-[11px] font-bold uppercase tracking-[0.42em] text-background/50">
          {mode === "ai" ? "Kickoff Mode" : mode === "local2p" ? "Local 1v1" : "Play vs Friend"}
        </div>
        <h1 className="mt-3 font-sans text-6xl font-black uppercase leading-none tracking-tight text-background">
          Arcade
          <br />
          <span className="text-[#63d68a]">Football</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xs text-sm leading-relaxed text-background/60">
          {MATCH_TUNING.periods} halves · {minutes} minutes · 11 v 11 · switch players with Q.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <ModeTab active={mode === "ai"} onClick={() => { setMode("ai"); cancelFriendFlow(); }}>
            Vs AI
          </ModeTab>
          <ModeTab active={mode === "local2p"} onClick={() => { setMode("local2p"); cancelFriendFlow(); }}>
            Local 1v1
          </ModeTab>
          <ModeTab active={mode === "friend"} onClick={() => setMode("friend")}>
            Vs Friend
          </ModeTab>
        </div>

        {mode === "ai" && (
          <>
            <ClubPicker label="Your Club" selectedId={homeId} onSelect={setHomeId} />
            <ClubPicker label="Opponent" selectedId={awayId} onSelect={setAwayId} />
            <DifficultyPicker selected={difficulty} onSelect={setDifficulty} />
            <button
              onClick={startVsAi}
              className="mt-8 w-full rounded-md bg-[#63d68a] px-6 py-4 font-sans text-lg font-black uppercase tracking-[0.2em] text-[#0d1a12] transition-transform hover:scale-[1.02] active:scale-[0.99]"
            >
              Kick Off
            </button>
          </>
        )}

        {mode === "local2p" && (
          <>
            <ClubPicker label="Player 1's Club" selectedId={homeId} onSelect={setHomeId} />
            <ClubPicker label="Player 2's Club" selectedId={awayId} onSelect={setAwayId} />
            <div className="mt-6 rounded-md bg-background/5 px-4 py-3 text-left text-xs leading-relaxed text-background/60">
              <span className="font-bold text-background/80">One keyboard, two players.</span> Player 1
              uses WASD + Space/E/Ctrl/Q/F/C. Player 2 uses the Arrow keys + Enter (shoot) / &apos; (pass)
              / Slash (loft) / Period (tackle) / Semicolon (switch player).
            </div>
            <button
              onClick={startLocal2P}
              className="mt-6 w-full rounded-md bg-[#63d68a] px-6 py-4 font-sans text-lg font-black uppercase tracking-[0.2em] text-[#0d1a12] transition-transform hover:scale-[1.02] active:scale-[0.99]"
            >
              Kick Off
            </button>
          </>
        )}

        {mode === "friend" && (
          <div className="mt-6">
            <ClubPicker label="Your Club" selectedId={homeId} onSelect={setHomeId} />

            {error && (
              <p className="mt-4 rounded-md bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">
                {error}
              </p>
            )}

            {friendStep === "choose" && (
              <div className="mt-6 flex flex-col gap-3">
                <button
                  onClick={startCreateRoom}
                  className="w-full rounded-md bg-[#63d68a] px-6 py-4 font-sans text-lg font-black uppercase tracking-[0.2em] text-[#0d1a12] transition-transform hover:scale-[1.02] active:scale-[0.99]"
                >
                  Create Room
                </button>
                <button
                  onClick={() => setFriendStep("join-form")}
                  className="w-full rounded-md border border-background/25 px-6 py-4 font-sans text-lg font-black uppercase tracking-[0.2em] text-background transition-colors hover:border-background/50"
                >
                  Join Room
                </button>
              </div>
            )}

            {friendStep === "connecting" && (
              <p className="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-background/50">
                Connecting…
              </p>
            )}

            {friendStep === "create-waiting" && (
              <div className="mt-8">
                <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-background/40">
                  Share this code
                </div>
                <div className="mt-2 rounded-md border border-[#63d68a]/40 bg-[#63d68a]/10 py-5 font-mono text-4xl font-black tracking-[0.3em] text-[#63d68a]">
                  {roomCode}
                </div>
                <p className="mt-4 text-sm text-background/50">Waiting for your friend to join…</p>
                <button
                  onClick={cancelFriendFlow}
                  className="mt-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-background/40 hover:text-background/70"
                >
                  Cancel
                </button>
              </div>
            )}

            {friendStep === "join-form" && (
              <div className="mt-6">
                <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-background/40 text-left">
                  Room code
                </div>
                <input
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  placeholder="ABCDE"
                  maxLength={6}
                  className="mt-2 w-full rounded-md border border-background/20 bg-transparent px-4 py-3 text-center font-mono text-2xl font-black tracking-[0.3em] text-background outline-none focus:border-[#63d68a]"
                />
                <button
                  onClick={startJoinRoom}
                  className="mt-4 w-full rounded-md bg-[#63d68a] px-6 py-4 font-sans text-lg font-black uppercase tracking-[0.2em] text-[#0d1a12] transition-transform hover:scale-[1.02] active:scale-[0.99]"
                >
                  Join
                </button>
                <button
                  onClick={cancelFriendFlow}
                  className="mt-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-background/40 hover:text-background/70"
                >
                  Back
                </button>
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => setSound((s) => !s)}
          className="mt-6 text-[11px] font-semibold uppercase tracking-[0.24em] text-background/50 transition-colors hover:text-background/80"
        >
          Sound: {sound ? "On" : "Off"}
        </button>

        <div className="mt-10 grid grid-cols-2 gap-y-2 text-left font-mono text-[11px] text-background/50">
          {mode === "local2p" ? (
            <>
              <span>P1: WASD</span>
              <span>Move</span>
              <span>P1: Space/E/Ctrl</span>
              <span>Shoot/Pass/Loft</span>
              <span>P2: Arrows</span>
              <span>Move</span>
              <span>P2: Enter / ' / . / ;</span>
              <span>Shoot/Pass/Tackle/Switch</span>
            </>
          ) : (
            <>
              <span>WASD / Arrows</span>
              <span>Move</span>
              <span>Shift</span>
              <span>Sprint</span>
              <span>Space (hold)</span>
              <span>Shoot</span>
              <span>E (hold)</span>
              <span>Pass</span>
              <span>Ctrl</span>
              <span>Loft</span>
              <span>C</span>
              <span>Toggle camera</span>
              <span>Q</span>
              <span>Switch player</span>
              <span>F</span>
              <span>Tackle</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DifficultyPicker({
  selected,
  onSelect,
}: {
  selected: Difficulty;
  onSelect: (d: Difficulty) => void;
}) {
  return (
    <div className="mt-6 text-left">
      <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-background/40">
        AI Difficulty
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {DIFFICULTIES.map((d) => {
          const active = d === selected;
          return (
            <button
              key={d}
              onClick={() => onSelect(d)}
              className={`rounded-md border px-2 py-2 text-[11px] font-bold uppercase tracking-wide transition-colors ${
                active
                  ? "border-[#63d68a] bg-[#63d68a]/15 text-background"
                  : "border-background/15 text-background/50 hover:border-background/30"
              }`}
            >
              {DIFFICULTY_LABEL[d]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-5 py-2 text-xs font-bold uppercase tracking-[0.2em] transition-colors ${
        active ? "bg-[#63d68a] text-[#0d1a12]" : "bg-background/10 text-background/60 hover:bg-background/15"
      }`}
    >
      {children}
    </button>
  );
}

function ClubPicker({
  label,
  selectedId,
  onSelect,
}: {
  label: string;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mt-6 text-left">
      <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-background/40">
        {label}
      </div>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {CLUBS.map((club) => {
          const active = club.id === selectedId;
          return (
            <button
              key={club.id}
              onClick={() => onSelect(club.id)}
              className={`flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                active
                  ? "border-[#63d68a] bg-[#63d68a]/15 text-background"
                  : "border-background/15 text-background/50 hover:border-background/30"
              }`}
            >
              <span
                className="h-3 w-3 rounded-full border border-background/30"
                style={{ backgroundColor: club.primaryColor }}
              />
              {club.shortName}
            </button>
          );
        })}
      </div>
    </div>
  );
}
