"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  History,
  Keyboard,
  Loader2,
  Mic,
  PhoneOff,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";

import { STARTERS, ask } from "@/lib/assistant";
import { DRIVING_STARTERS, drive } from "@/lib/commands";
import { useRoomVoice } from "./RoomVoice";
import { cn } from "@/lib/utils";

/**
 * Poll360 AI, the face and the voice.
 *
 * ── WHY IT LOOKS LIKE THIS AND NOT LIKE A CHAT WINDOW ──────────────────────
 * The first version of this was a chat panel in the bottom corner: a column of
 * bubbles, a text box, a send button. It was wrong for the room it is in.
 * Nobody on a live desk reads a transcript, and a panel that size covers the
 * one part of the screen somebody is pointing at while they talk about it.
 *
 * So the assistant is not a window any more. It is a layer over the room, the
 * way it works on a television: the dashboard stays exactly where it was and
 * stays completely visible, one line of very large type along the bottom shows
 * what was heard as it is being heard, and the answer arrives above it and
 * then gets out of the way. Everything is legible from across a room, because
 * across a room is where the person who asked usually is.
 *
 * ── IT DRIVES, AND DRIVING IS THE POINT ────────────────────────────────────
 * Asking it a question was only ever half of it. "Show me Kano", "open
 * turnout", "put that on the board", "go back": those change the room rather
 * than describing it, and the room changes underneath the overlay while the
 * person is still watching it. The intention is worked out in `lib/commands`,
 * and the room carries it out through `RoomVoice`. Nothing about how a map
 * moves lives in this file.
 *
 * ── A CALL, NOT AN OPEN MICROPHONE ─────────────────────────────────────────
 * The original decision stands and is worth restating, because the new
 * presentation makes it tempting to break: this never listens until somebody
 * asks it to. A microphone that opens itself is a microphone recording a
 * conversation about an unreleased result. It is silent until called, it is
 * unmistakable when it is listening, and hanging up releases the microphone
 * rather than merely hiding the overlay.
 *
 * Speaking and listening are never both on. Recognition stops while an answer
 * is read out and restarts when it finishes, or the assistant hears itself and
 * answers its own voice.
 *
 * ── IT RUNS ON THE DEVICE ──────────────────────────────────────────────────
 * Speech in and speech out are the browser's own. Nothing leaves the machine.
 * On a browser that cannot listen, the overlay still opens and says so, and
 * everything can be typed instead.
 * ───────────────────────────────────────────────────────────────────────────
 */

const GREETING =
  "Poll360 AI here. Ask me anything about the result, or just tell me where to go.";

/* How long an answer stays up before it clears itself out of the way. Long
   enough to read a paragraph aloud, short enough that a board left alone does
   not sit under a stale caption. Touching the overlay resets it. */
const LINGER = 22_000;

export default function Assistant({ tab = "results", projection = null }) {
  const room = useRoomVoice();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [calling, setCalling] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [heard, setHeard] = useState("");
  const [typed, setTyped] = useState("");
  const [typing, setTyping] = useState(false);
  const [notice, setNotice] = useState(null);
  const [reply, setReply] = useState(null);
  const [turns, setTurns] = useState([]);
  const [showTurns, setShowTurns] = useState(false);

  const recognition = useRef(null);
  const wantsMic = useRef(false);
  const log = useRef(null);
  /* The recogniser is built once and must survive every re-render, but the
     handler it calls changes whenever the room moves. The ref is the seam
     between the two: rebuilding the recogniser to pick up a new closure would
     drop the microphone mid-sentence. */
  const respondRef = useRef(null);
  /* The last thing said, so "put that on the board" has a "that". */
  const lastAnswer = useRef(null);
  const linger = useRef(null);

  /* Speech lives on window, so this is read once at mount rather than in an
     effect. Nothing rendered before the overlay opens depends on it, so the
     server and the client still agree on the first paint. */
  const [canHear] = useState(
    () =>
      typeof window !== "undefined" &&
      Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
  const [canSpeak] = useState(() => typeof window !== "undefined" && "speechSynthesis" in window);

  /* Nigerian English if the device has it, British if not, because a Nigerian
     place name read in a General American voice is often unrecognisable. */
  const pickVoice = useCallback(() => {
    const voices = window.speechSynthesis.getVoices();
    return (
      voices.find((voice) => voice.lang === "en-NG") ??
      voices.find((voice) => voice.lang?.startsWith("en-GB")) ??
      voices.find((voice) => voice.lang?.startsWith("en")) ??
      null
    );
  }, []);

  const startListening = useCallback(() => {
    if (!canHear || !wantsMic.current) return;
    try {
      recognition.current?.start();
    } catch {
      /* Already running. The API throws rather than no-opping, and a double
         start is a normal race here, not a fault worth surfacing. */
    }
  }, [canHear]);

  const speak = useCallback(
    (text, { thenListen = false } = {}) => {
      if (!canSpeak || muted || !text) {
        if (thenListen) startListening();
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = pickVoice();
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang ?? "en-GB";
      /* Slightly under natural pace. These are numbers being read to a room
         that may be writing them down. */
      utterance.rate = 0.98;
      utterance.pitch = 1;

      /* ── WHY THERE IS A DEADLINE ───────────────────────────────────────
         Speech synthesis does not always finish. A device with no voice
         installed, a tab that loses focus mid-sentence, an engine still
         warming up: in each case `onend` never arrives, and without a deadline
         the overlay would sit on "Speaking" and never re-open the microphone.
         Whichever lands first wins, and the finish only runs once. */
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(deadline);
        setSpeaking(false);
        if (thenListen && wantsMic.current) startListening();
      };

      /* Roughly speaking pace, plus a second of slack. */
      const deadline = setTimeout(finish, Math.min(30_000, 1000 + text.length * 65));

      utterance.onstart = () => setSpeaking(true);
      utterance.onend = finish;
      utterance.onerror = finish;

      window.speechSynthesis.speak(utterance);
    },
    [canSpeak, muted, pickVoice, startListening]
  );

  /* ── carrying out an instruction ────────────────────────────────────────
     The room is asked, never told. It hands back a sentence when it knows
     something the assistant does not, an empty board, a contest with no
     country above it, and that sentence wins over the one planned here. */
  const carryOut = useCallback(
    (order) => {
      const act = order.act;

      if (act.do === "route") {
        router.push(act.href);
        return { text: order.say ?? "On my way.", kind: "drive" };
      }

      /* This dashboard cannot do it, but one of them can. Sending somebody
         to the room that can is more use than telling them it exists. */
      if (!room?.run) {
        if (act.do === "tab" || act.do === "place" || act.do === "pin") {
          router.push("/room");
          return { text: "That lives in the situation room. Opening it now.", kind: "drive" };
        }
        return {
          text: "That one only works in the situation room. Say take me to the situation room and I will open it.",
          kind: "drive",
        };
      }

      /* "Put that on the board" means the last thing said out loud. The room
         has no way of knowing what that was, so it is filled in here. */
      const filled =
        act.do === "pin" && act.card?.kind === "answer"
          ? { ...act, card: { ...act.card, text: lastAnswer.current ?? "" } }
          : act;

      const objection = room.run(filled);
      return { text: objection ?? order.say ?? "Done.", kind: "drive" };
    },
    [room, router]
  );

  const respond = useCallback(
    (question, { spoken = false } = {}) => {
      const text = question.trim();
      if (!text) return;

      /* An instruction first, a question second. The command reader is strict
         and returns nothing unless it is confident, so anything it declines
         falls through to being answered, which is the safe direction. */
      const order = drive(text, {
        tabs: room?.tabs ?? [],
        path: room?.path ?? [],
        lgas: room?.lgas ?? [],
      });

      const answer = order
        ? carryOut(order)
        : ask(text, { tab, projection });

      lastAnswer.current = answer.text;
      setHeard("");
      setReply(answer);
      setTurns((previous) => [...previous, { role: "you", text }, { role: "ai", ...answer }]);
      speak(answer.text, { thenListen: spoken });

      clearTimeout(linger.current);
      linger.current = setTimeout(() => setReply(null), LINGER);
    },
    [room, carryOut, tab, projection, speak]
  );

  useEffect(() => {
    respondRef.current = respond;
  });

  /* One recogniser for the life of the overlay. Rebuilding it per utterance
     loses the permission grant on some browsers and stutters on the rest. */
  useEffect(() => {
    if (!canHear) return undefined;

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const engine = new Recognition();
    engine.lang = "en-NG";
    engine.continuous = false;
    engine.interimResults = true;
    engine.maxAlternatives = 1;

    engine.onstart = () => setListening(true);
    engine.onend = () => {
      setListening(false);
      /* A recogniser stops on its own after a pause. If the call is still up
         and nothing is being read out, open it again so the room can keep
         talking without pressing anything. */
      if (wantsMic.current && !window.speechSynthesis?.speaking) {
        setTimeout(() => wantsMic.current && startListening(), 350);
      }
    };

    engine.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        wantsMic.current = false;
        setCalling(false);
        setNotice("The microphone is blocked for this site. Allow it in the browser, or type instead.");
      } else if (event.error === "no-speech") {
        setNotice(null);
      }
    };

    engine.onresult = (event) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) {
          const said = result[0].transcript.trim();
          setHeard(said);
          respondRef.current?.(said, { spoken: true });
          return;
        }
        interim += result[0].transcript;
      }
      setHeard(interim);
    };

    recognition.current = engine;
    return () => {
      engine.onend = null;
      try {
        engine.stop();
      } catch {
        /* Nothing to stop. */
      }
      recognition.current = null;
    };
  }, [canHear, startListening]);

  const beginCall = () => {
    setOpen(true);
    setNotice(null);
    setReply({ text: GREETING, kind: "greeting" });
    lastAnswer.current = GREETING;
    speak(GREETING, { thenListen: canHear });

    if (canHear) {
      wantsMic.current = true;
      setCalling(true);
      startListening();
    } else {
      setTyping(true);
      setNotice("This browser cannot listen, so type instead. Chrome and Edge can hear you.");
    }
  };

  const endCall = useCallback(() => {
    wantsMic.current = false;
    setCalling(false);
    setListening(false);
    setHeard("");
    try {
      recognition.current?.stop();
    } catch {
      /* Already stopped. */
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }, []);

  const hangUp = () => {
    endCall();
    clearTimeout(linger.current);
    setReply(null);
    setTyping(false);
    setShowTurns(false);
    setOpen(false);
  };

  useEffect(() => () => {
    clearTimeout(linger.current);
    endCall();
  }, [endCall]);

  /* Newest turn in view without yanking the panel around it. */
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [turns, showTurns]);

  /* Escape hangs up, from anywhere. On a wall display the pointer is often
     nowhere near the screen. */
  useEffect(() => {
    if (!open) return undefined;
    const key = (event) => event.key === "Escape" && hangUp();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  /* What to offer next: whatever the last answer suggested, otherwise a mix of
     things to ask and things to tell it to do, because half of what it can do
     is invisible until somebody sees an instruction written down. */
  const suggestions = useMemo(() => {
    if (reply?.follow?.length) return reply.follow.slice(0, 4);
    return room?.run
      ? [DRIVING_STARTERS[0], STARTERS[0], DRIVING_STARTERS[2], STARTERS[3]]
      : STARTERS.slice(0, 4);
  }, [reply, room]);

  const mode = speaking ? "speaking" : listening ? "listening" : calling ? "thinking" : "idle";

  /* ------------------------------------------------------------- launcher */
  if (!open) {
    return (
      <button
        type="button"
        onClick={beginCall}
        className="group fixed right-5 bottom-5 z-40 flex items-center gap-3 rounded-full border border-white/10 bg-dash-ink/95 py-2.5 pr-5 pl-2.5 text-white shadow-e4 backdrop-blur transition-transform hover:scale-[1.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red"
      >
        <Orb mode="idle" size={34} />
        <span className="text-left">
          <span className="block text-[0.8125rem] leading-tight font-extrabold">Hi Poll360 AI</span>
          <span className="block text-[0.625rem] leading-tight text-white/60">
            Ask it, or tell it where to go
          </span>
        </span>
      </button>
    );
  }

  /* ----------------------------------------------------------- the overlay */
  return (
    <div
      aria-label="Poll360 AI"
      role="region"
      /* The room behind stays visible and stays live. Only the strip along the
         bottom takes the pointer, so a producer can still click the map with
         the assistant up. */
      className="pointer-events-none fixed inset-0 z-50 flex flex-col justify-end"
    >
      {/* ── THE BAND ────────────────────────────────────────────────────────
          A soft rise to near-black along the bottom edge rather than a panel
          with a border. Type this large has to sit on something, and a hard
          edge across a live map reads as a broken screen. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/85 via-black/55 to-transparent"
      />

      {/* ── THE LISTENING LINE ──────────────────────────────────────────────
          A light running along the very bottom edge of the display whenever
          the microphone is open. It is the one signal readable from the far
          side of a room, and it is off the instant the microphone is. */}
      {listening && (
        <span
          aria-hidden="true"
          className="animate-ai-sweep absolute inset-x-0 bottom-0 h-[3px] bg-[linear-gradient(90deg,transparent,var(--ai-1),var(--ai-2),var(--ai-3),transparent)] bg-[length:50%_100%] bg-no-repeat"
        />
      )}

      <div className="pointer-events-auto relative mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 pb-5 lg:px-8 lg:pb-7">
        {notice && (
          <p className="animate-ai-rise self-start rounded-dash bg-amber-400/15 px-3.5 py-2 text-[0.8125rem] text-amber-100 backdrop-blur">
            {notice}
          </p>
        )}

        {/* -------------------------------------------------------- the log */}
        {showTurns && (
          <div className="animate-ai-rise self-end">
            <div
              ref={log}
              className="max-h-[45vh] w-[min(30rem,calc(100vw-2rem))] space-y-2.5 overflow-y-auto rounded-dash border border-white/10 bg-black/70 p-4 backdrop-blur-xl"
            >
              {turns.length === 0 ? (
                <p className="text-[0.8125rem] text-white/50">Nothing said yet.</p>
              ) : (
                turns.map((turn, index) => (
                  <p
                    key={index}
                    className={cn(
                      "text-[0.8125rem] leading-relaxed",
                      turn.role === "you" ? "font-semibold text-white/60" : "text-white"
                    )}
                  >
                    {turn.role === "you" ? "You · " : "Poll360 AI · "}
                    {turn.text}
                  </p>
                ))
              )}
            </div>
          </div>
        )}

        {/* ----------------------------------------------------- the answer */}
        {reply && (
          <div
            key={reply.text}
            className="animate-ai-rise max-w-3xl rounded-dash border border-white/10 bg-black/55 px-5 py-4 backdrop-blur-xl"
          >
            <p className="text-[clamp(1rem,0.9rem+0.5vw,1.375rem)] leading-relaxed font-medium text-white">
              {reply.text}
            </p>
            {reply.synthetic && (
              <p className="mt-2 text-[0.6875rem] font-bold tracking-[0.1em] text-amber-300 uppercase">
                Generated figure, not a measured one
              </p>
            )}
          </div>
        )}

        {/* ---------------------------------------------------- suggestions */}
        <ul className="flex flex-wrap gap-2">
          {suggestions.map((line) => (
            <li key={line}>
              <button
                type="button"
                onClick={() => respond(line)}
                className="rounded-full border border-white/15 bg-black/40 px-3.5 py-1.5 text-[0.8125rem] font-semibold text-white/75 backdrop-blur transition-colors hover:border-white/40 hover:text-white"
              >
                {line}
              </button>
            </li>
          ))}
        </ul>

        {/* -------------------------------------------------------- the bar */}
        <div className="flex items-center gap-4">
          <Orb mode={mode} size={56} />

          {/* ── THE CAPTION ─────────────────────────────────────────────────
              What is being heard, at the size a television uses, because the
              person who asked is usually not at the keyboard. Empty, it says
              what the assistant is doing instead, so the line is never blank
              and never jumps in height. */}
          <p className="min-w-0 flex-1 truncate text-[clamp(1.125rem,0.95rem+0.9vw,1.875rem)] leading-tight font-semibold tracking-[-0.02em] text-white">
            {heard ? (
              <span>“{heard}”</span>
            ) : (
              <span className="text-white/45">
                {speaking
                  ? "Speaking…"
                  : listening
                    ? "Listening…"
                    : calling
                      ? "One moment…"
                      : "Press the microphone, or type"}
              </span>
            )}
          </p>

          <div className="flex shrink-0 items-center gap-1.5">
            <Control
              icon={History}
              label={showTurns ? "Hide what was said" : "Show what was said"}
              on={showTurns}
              onClick={() => setShowTurns((value) => !value)}
            />
            <Control
              icon={Keyboard}
              label={typing ? "Close the keyboard" : "Type instead"}
              on={typing}
              onClick={() => setTyping((value) => !value)}
            />
            {canSpeak && (
              <Control
                icon={muted ? VolumeX : Volume2}
                label={muted ? "Turn the voice back on" : "Mute the voice"}
                on={muted}
                onClick={() => {
                  setMuted((value) => !value);
                  if (!muted) window.speechSynthesis.cancel();
                }}
              />
            )}
            {canHear && (
              <Control
                icon={Mic}
                label={calling ? "Stop listening" : "Start listening"}
                on={calling}
                live={calling}
                onClick={() => {
                  if (calling) {
                    endCall();
                  } else {
                    wantsMic.current = true;
                    setCalling(true);
                    startListening();
                  }
                }}
              />
            )}
            <Control icon={PhoneOff} label="Close Poll360 AI" danger onClick={hangUp} />
          </div>
        </div>

        {/* ------------------------------------------------------- the keys */}
        {typing && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              respond(typed);
              setTyped("");
            }}
            className="animate-ai-rise flex items-center gap-2"
          >
            <input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder="Ask about any state, party or figure, or say where to go"
              aria-label="Ask Poll360 AI"
              className="min-w-0 flex-1 rounded-full border border-white/15 bg-black/50 px-5 py-3 text-[1rem] text-white backdrop-blur outline-none placeholder:text-white/35 focus:border-white/45"
            />
            <button
              type="submit"
              disabled={!typed.trim()}
              className="shrink-0 rounded-full bg-white px-5 py-3 text-[0.875rem] font-bold text-black transition-opacity disabled:opacity-30"
            >
              Ask
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Control({ icon: Icon, label, onClick, on, live, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={on ? true : undefined}
      className={cn(
        "relative flex size-11 items-center justify-center rounded-full border backdrop-blur transition-colors",
        danger
          ? "border-white/15 bg-black/40 text-white/70 hover:border-red-400/60 hover:bg-red-500/20 hover:text-white"
          : on
            ? "border-white/70 bg-white text-black"
            : "border-white/15 bg-black/40 text-white/70 hover:border-white/40 hover:text-white"
      )}
    >
      <Icon size={17} strokeWidth={2.25} />
      {live && (
        <span
          aria-hidden="true"
          className="animate-pulse-live absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-red-500"
        />
      )}
    </button>
  );
}

/**
 * The orb.
 *
 * ── WHY A SPHERE AND NOT AN ICON ───────────────────────────────────────────
 * The assistant has four states that matter and they have to be told apart
 * from across a room, at a glance, by somebody who is mid-sentence: waiting,
 * hearing you, working, talking. An icon can carry one of those. A moving
 * object carries all four, because motion is legible in peripheral vision in a
 * way that shape is not.
 *
 *   Waiting    a slow turn, nothing else.
 *   Listening  it breathes, and a halo pushes out around it in time.
 *   Working    the turn speeds up, the halo stops.
 *   Speaking   it breathes faster, with the halo held wide.
 *
 * Its colours are deliberately not any party's, not the alarm red and not the
 * map's blues. Nothing about the assistant should ever be mistaken for data.
 */
function Orb({ mode = "idle", size = 56 }) {
  const halo = mode === "listening" || mode === "speaking";

  return (
    <span
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {halo && (
        <span
          className="absolute inset-0 animate-ping rounded-full bg-[var(--ai-2)] opacity-25"
          style={{ animationDuration: mode === "speaking" ? "1.1s" : "1.8s" }}
        />
      )}

      <span
        className={cn(
          "absolute inset-0 rounded-full blur-[6px] opacity-70",
          mode === "idle" ? "animate-orb-turn-slow" : "animate-orb-turn"
        )}
        style={{
          background:
            "conic-gradient(from 0deg, var(--ai-1), var(--ai-2), var(--ai-3), var(--ai-1))",
        }}
      />

      <span
        className={cn(
          "relative rounded-full",
          mode === "idle" ? "animate-orb-turn-slow" : "animate-orb-turn",
          (mode === "listening" || mode === "speaking") && "animate-orb-breathe"
        )}
        style={{
          width: size * 0.78,
          height: size * 0.78,
          background:
            "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.95), rgba(255,255,255,0) 42%), conic-gradient(from 0deg, var(--ai-1), var(--ai-2), var(--ai-3), var(--ai-1))",
        }}
      />

      {mode === "thinking" && (
        <Loader2 size={size * 0.34} className="relative animate-spin text-white/90" />
      )}
      {mode === "idle" && size > 40 && (
        <Sparkles size={size * 0.28} strokeWidth={2.5} className="relative text-white/85" />
      )}
    </span>
  );
}
