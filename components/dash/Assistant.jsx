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
import { bestVoice, sentences } from "@/lib/voice";
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
  /**
   * How much of the screen the assistant is entitled to.
   *
   * "full" is the greeting: the moment after it is called, when it is the
   * subject and there is nothing else to look at. "compact" is every moment
   * after it has answered once, when it has changed the screen and the screen
   * is the point. It stays fully live in both.
   */
  const [stage, setStage] = useState("full");

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
  /* Whether the microphone itself was granted. It is the difference between
     "you cannot have a microphone" and "you have a microphone, and this
     browser will not let a page run speech recognition with it", which are
     different problems with different answers and were being told apart by
     nobody. */
  const micGranted = useRef(false);

  /* Speech lives on window, so this is read once at mount rather than in an
     effect. Nothing rendered before the overlay opens depends on it, so the
     server and the client still agree on the first paint. */
  const [canHear] = useState(
    () =>
      typeof window !== "undefined" &&
      Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
  const [canSpeak] = useState(() => typeof window !== "undefined" && "speechSynthesis" in window);

  /* ── THE VOICE ───────────────────────────────────────────────────────────
     Held in a ref and chosen again whenever the browser says the list has
     changed. `getVoices()` is usually empty the first time anything asks, so
     choosing once at start-up is how an app ends up permanently reading in
     the worst voice on the machine. The ranking itself is in `lib/voice`. */
  const voice = useRef(null);

  useEffect(() => {
    if (!canSpeak) return undefined;

    const choose = () => {
      voice.current = bestVoice(window.speechSynthesis.getVoices());
    };

    choose();
    window.speechSynthesis.addEventListener("voiceschanged", choose);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", choose);
  }, [canSpeak]);

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
      const deadline = setTimeout(finish, Math.min(45_000, 1500 + text.length * 75));

      /* ── ONE SENTENCE AT A TIME ────────────────────────────────────────
         Every engine flattens across a long utterance and several stop
         partway through one. Queued sentence by sentence, each is planned
         and read as a sentence, which is both more reliable and noticeably
         more natural. Only the last one re-opens the microphone. */
      const lines = sentences(text);

      lines.forEach((line, index) => {
        const utterance = new SpeechSynthesisUtterance(line);
        if (voice.current) utterance.voice = voice.current;
        utterance.lang = voice.current?.lang ?? "en-GB";
        /* Just under natural pace, and a shade below default pitch: these are
           numbers being read to a room that may be writing them down, and a
           bright voice reading figures gets tiring within a minute. */
        utterance.rate = 0.96;
        utterance.pitch = 0.96;
        utterance.volume = 1;

        if (index === 0) utterance.onstart = () => setSpeaking(true);
        if (index === lines.length - 1) {
          utterance.onend = finish;
          utterance.onerror = finish;
        } else {
          utterance.onerror = finish;
        }

        window.speechSynthesis.speak(utterance);
      });

      if (!lines.length) finish();
    },
    [canSpeak, muted, startListening]
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

      /* ── IT GETS OUT OF THE WAY THE MOMENT IT HAS BEEN USEFUL ──────────
         Saying hello to it, or asking what it can do, is a question about
         the assistant, so it stays open. Everything else is a question
         about the election or an instruction to move the room, and the
         answer to both is behind the overlay. */
      const aboutItself = answer.kind === "identity" || answer.kind === "help";
      setStage(aboutItself ? "full" : "compact");

      clearTimeout(linger.current);
      /* The big card clears itself so a room that walked away is not left
         reading an hour-old sentence in 24-point type. The small one keeps
         the last answer: it is out of the way, and being able to look back
         at what was just said is worth more there than tidiness. */
      if (aboutItself) linger.current = setTimeout(() => setReply(null), LINGER);
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

    /* ── THE RECOGNISER'S OWN FAILURES ─────────────────────────────────────
       Separate from the microphone's, and routinely confused with them. By
       the time this fires we already know whether the microphone was granted,
       so each of these can be told apart and answered on its own terms.

       The one that catches people out is the third: recognition in Chrome is
       not done on the machine, it is sent to a Google service. A Chromium
       build without a key for that service, or a browser with no connection,
       refuses in exactly the same breath as a denied microphone, and the
       microphone is not the problem in either case. */
    const stop = (message) => {
      wantsMic.current = false;
      setCalling(false);
      setTyping(true);
      setNotice(message);
    };

    engine.onerror = (event) => {
      switch (event.error) {
        case "not-allowed":
          if (micGranted.current) {
            stop(
              "The microphone is on, but this browser will not let a page use speech recognition. Chrome or Edge will. Everything here works typed in the meantime."
            );
          } else {
            stop(
              "The microphone is switched off for this site. Click the padlock at the left of the address bar, set Microphone to Allow, then reload."
            );
          }
          break;

        case "service-not-allowed":
          stop(
            "This browser has no speech service to send the audio to. Chrome and Edge do; several Chromium browsers built from the same code do not. Type instead, and nothing else changes."
          );
          break;

        case "network":
          stop(
            "Speech recognition needs a connection, because the browser sends the audio away to be read. There is none right now, so type instead."
          );
          break;

        case "audio-capture":
          stop("The microphone stopped responding. Check it is still plugged in, then press the microphone again.");
          break;

        case "no-speech":
          /* Normal. It simply heard nothing before it timed out, and it will
             open itself again a moment from now. */
          setNotice(null);
          break;

        default:
          break;
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

  /**
   * Ask for the microphone properly, and say precisely what is wrong if we
   * cannot have it.
   *
   * ── WHY THIS IS NOT LEFT TO THE RECOGNISER ─────────────────────────────
   * Speech recognition asks for the microphone on your behalf, and when it is
   * refused it reports "not-allowed" and nothing else. That single word covers
   * at least four different situations with four different fixes, and telling
   * somebody "the microphone is blocked" when the real problem is the address
   * they typed is worse than saying nothing: they will go and hunt through
   * browser settings that were never the issue.
   *
   * Asking for it directly separates them. The commonest by a distance is the
   * third one below, and nothing in a browser's settings will ever fix it.
   *
   *   No microphone      nothing plugged in or built in.
   *   Refused            the permission was declined, once, and remembered.
   *   Insecure address   opened over plain http on a network address. Browsers
   *                      only allow a microphone on https, or on localhost.
   *                      Same machine, same server, different address: one
   *                      works and the other cannot.
   *
   * The permission is all we want, so the track is stopped the instant it is
   * granted. Holding it open would leave the browser's recording light on over
   * a conversation about an unreleased result, which is the one thing this
   * assistant promises never to do.
   */
  const askForMicrophone = useCallback(async () => {
    if (typeof window === "undefined") return false;

    if (!window.isSecureContext) {
      setNotice(
        "This page is open on a plain network address, and no browser will offer a microphone on one. Open it at localhost instead, or run the server with npm run dev:secure and open the https address. Nothing needs changing in your settings."
      );
      return false;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      /* Nothing to ask with. The recogniser may still work on its own, so
         this is not treated as a refusal. */
      return true;
    }

    /* ── WHAT THE SITE ITSELF IS ALLOWED ──────────────────────────────────
       Asked before we try, because it is the one thing that separates "you
       said no to this website" from "your computer is not letting this
       browser near a microphone at all". If the site is granted and the
       request still fails, no amount of clicking the padlock will help, and
       sending somebody there is what makes an error message useless. */
    let sitePermission = null;
    try {
      sitePermission = (await navigator.permissions.query({ name: "microphone" })).state;
    } catch {
      /* Firefox and Safari do not answer for the microphone. We simply do
         not get the extra clue, and the messages below stay general. */
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of stream.getTracks()) track.stop();
      micGranted.current = true;
      setNotice(null);
      return true;
    } catch (error) {
      micGranted.current = false;
      const name = error?.name;

      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setNotice("There is no microphone on this machine that the browser can see. Type instead.");
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        setNotice(
          "Something else on this machine is already holding the microphone. Close whatever is using it, then try again."
        );
      } else if (sitePermission === "granted") {
        /* The website is allowed and it still failed. That is the operating
           system, and it is the case people lose the most time to, because
           every message they will find on the internet is about the padlock. */
        setNotice(
          "This site is allowed to use the microphone, so it is your computer blocking it, not this page. On a Mac open System Settings, then Privacy and Security, then Microphone, switch your browser on, and quit and reopen the browser. On Windows it is Settings, Privacy, Microphone."
        );
      } else if (name === "NotAllowedError" || name === "SecurityError") {
        setNotice(
          "The microphone is switched off for this site. Click the padlock at the left of the address bar, set Microphone to Allow, then reload. If the browser never asked you, it is remembering an earlier no."
        );
      } else {
        setNotice("The microphone could not be opened. Type instead, and everything still works.");
      }
      return false;
    }
  }, []);

  /**
   * Take the microphone, having first made sure we are allowed one.
   *
   * `listenNow` is false when a greeting is about to be read out: the call is
   * armed, and the recogniser is opened by whatever finishes speaking. Opening
   * it here as well would have the assistant listening to itself say hello,
   * and then answering it.
   */
  const takeMicrophone = useCallback(
    async ({ listenNow = true } = {}) => {
      const allowed = await askForMicrophone();
      if (!allowed) {
        wantsMic.current = false;
        setCalling(false);
        setTyping(true);
        return false;
      }
      wantsMic.current = true;
      setCalling(true);
      if (listenNow) startListening();
      return true;
    },
    [askForMicrophone, startListening]
  );

  const beginCall = async () => {
    setOpen(true);
    setStage("full");
    setNotice(null);
    setReply({ text: GREETING, kind: "greeting" });
    lastAnswer.current = GREETING;

    if (!canHear) {
      speak(GREETING);
      setTyping(true);
      setNotice(
        "This browser cannot listen, so type instead. Chrome and Edge can hear you, and everything works either way."
      );
      return;
    }

    /* The permission is settled before anything is said, so the prompt lands
       while the person is still looking at the button they just pressed
       rather than over the top of a greeting. Where it has been granted
       before, this resolves in a few milliseconds and nobody sees a thing. */
    const armed = await takeMicrophone({ listenNow: false });
    speak(GREETING, { thenListen: armed });
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
  /* ── THE STATUS LINE, SHARED BY BOTH SIZES ─────────────────────────────── */
  const status = speaking
    ? "Speaking"
    : listening
      ? "Listening"
      : calling
        ? "One moment"
        : "Paused";

  const controls = (small) => (
    <>
      {!small && (
        <Control
          icon={History}
          label={showTurns ? "Hide what was said" : "Show what was said"}
          on={showTurns}
          small={small}
          onClick={() => setShowTurns((value) => !value)}
        />
      )}
      <Control
        icon={Keyboard}
        label={typing ? "Close the keyboard" : "Type instead"}
        on={typing}
        small={small}
        onClick={() => setTyping((value) => !value)}
      />
      {canSpeak && (
        <Control
          icon={muted ? VolumeX : Volume2}
          label={muted ? "Turn the voice back on" : "Mute the voice"}
          on={muted}
          small={small}
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
          small={small}
          onClick={() => {
            if (calling) endCall();
            else takeMicrophone();
          }}
        />
      )}
      <Control icon={PhoneOff} label="Close Poll360 AI" danger small={small} onClick={hangUp} />
    </>
  );

  const keys = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        respond(typed);
        setTyped("");
      }}
      className="flex items-center gap-2"
    >
      <input
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        placeholder="Ask, or say where to go"
        aria-label="Ask Poll360 AI"
        className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-[0.875rem] text-white outline-none placeholder:text-white/35 focus:border-white/45"
      />
      <button
        type="submit"
        disabled={!typed.trim()}
        className="shrink-0 rounded-full bg-white px-4 py-2.5 text-[0.8125rem] font-bold text-black transition-opacity disabled:opacity-30"
      >
        Ask
      </button>
    </form>
  );

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

  /* ═══════════════════════════════════════════════════════════ the small one
     ── WHY IT SHRINKS AFTER THE FIRST ANSWER ────────────────────────────────
     The full-width version is a greeting. It is the right thing for the two
     seconds after somebody calls it, when the assistant is the subject and
     there is nothing else to look at, and it is exactly the wrong thing for
     every second after that, because by then the assistant has changed the
     screen and the screen is the point. Standing over a map it has just
     drawn, explaining what it drew, is the one thing it must never do.

     So it gets out of the way the moment it has been useful, and carries on
     working from the corner: still listening, still showing what it heard as
     it hears it, still reading the answer out. Nothing is turned off by the
     collapse except the amount of the room it is covering. Saying hello to it
     again opens it back out, and so does pressing the orb.
     ═══════════════════════════════════════════════════════════════════════ */
  if (stage === "compact") {
    return (
      <section
        aria-label="Poll360 AI"
        className="animate-ai-rise fixed right-5 bottom-5 z-50 w-[min(25rem,calc(100vw-2.5rem))] overflow-hidden rounded-dash border border-white/12 bg-black/85 text-white shadow-e4 backdrop-blur-xl"
      >
        {listening && (
          <span
            aria-hidden="true"
            className="animate-ai-sweep absolute inset-x-0 top-0 h-[2px] bg-[linear-gradient(90deg,transparent,var(--ai-1),var(--ai-2),var(--ai-3),transparent)] bg-[length:50%_100%] bg-no-repeat"
          />
        )}

        <div className="flex items-start gap-3 px-3.5 pt-3.5 pb-3">
          <button
            type="button"
            onClick={() => setStage("full")}
            aria-label="Open Poll360 AI out"
            title="Open it out"
            className="shrink-0 rounded-full transition-transform hover:scale-105"
          >
            <Orb mode={mode} size={40} />
          </button>

          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[0.625rem] font-bold tracking-[0.14em] text-white/40 uppercase">
              {status}
            </p>

            {/* What is being heard, as it is heard. This is the half of the
                assistant people check on, so it stays at the top and stays
                bigger than the answer under it. */}
            <p className="mt-1 line-clamp-2 text-[0.9375rem] leading-snug font-semibold text-white">
              {heard ? `“${heard}”` : <span className="text-white/35">Say what you need</span>}
            </p>

            {reply && (
              <p className="mt-1.5 line-clamp-4 text-[0.8125rem] leading-relaxed text-white/70">
                {reply.text}
              </p>
            )}

            {reply?.synthetic && (
              <p className="mt-1.5 text-[0.625rem] font-bold tracking-[0.1em] text-amber-300 uppercase">
                Generated figure
              </p>
            )}
          </div>
        </div>

        {notice && (
          <p className="border-t border-white/10 bg-amber-400/10 px-3.5 py-2 text-[0.75rem] text-amber-100">
            {notice}
          </p>
        )}

        {typing && <div className="border-t border-white/10 px-3 py-2.5">{keys}</div>}

        <div className="flex items-center gap-1 border-t border-white/10 px-2.5 py-2">
          <button
            type="button"
            onClick={() => setStage("full")}
            className="mr-auto rounded-full px-2 py-1 text-[0.6875rem] font-semibold text-white/45 transition-colors hover:text-white"
          >
            Open it out
          </button>
          {controls(true)}
        </div>
      </section>
    );
  }

  /* ═════════════════════════════════════════════════════════════ the big one
     Only ever the moment after it is called, and only until it has answered
     once. The room behind stays visible and stays live: the band is a rise to
     black along the bottom edge rather than a panel, because a hard edge
     across a live map reads as a broken screen.
     ═══════════════════════════════════════════════════════════════════════ */
  return (
    <div
      aria-label="Poll360 AI"
      role="region"
      className="pointer-events-none fixed inset-0 z-50 flex flex-col justify-end"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/80 via-black/40 to-transparent"
      />

      {/* The light along the bottom edge of the display whenever the
          microphone is open. The one signal readable from the far side of a
          room, and off the instant the microphone is. */}
      {listening && (
        <span
          aria-hidden="true"
          className="animate-ai-sweep absolute inset-x-0 bottom-0 h-[3px] bg-[linear-gradient(90deg,transparent,var(--ai-1),var(--ai-2),var(--ai-3),transparent)] bg-[length:50%_100%] bg-no-repeat"
        />
      )}

      <div className="pointer-events-auto relative mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 pb-5 lg:px-8 lg:pb-6">
        {notice && (
          <p className="animate-ai-rise self-start rounded-dash bg-amber-400/15 px-3.5 py-2 text-[0.8125rem] text-amber-100 backdrop-blur">
            {notice}
          </p>
        )}

        {showTurns && (
          <div className="animate-ai-rise self-end">
            <div
              ref={log}
              className="max-h-[38vh] w-[min(30rem,calc(100vw-2rem))] space-y-2.5 overflow-y-auto rounded-dash border border-white/10 bg-black/75 p-4 backdrop-blur-xl"
            >
              {turns.length === 0 ? (
                <p className="text-[0.8125rem] text-white/50">Nothing said yet.</p>
              ) : (
                turns.map((turn, index) => (
                  <p
                    key={index}
                    className={cn(
                      "text-[0.8125rem] leading-relaxed",
                      turn.role === "you" ? "font-semibold text-white/55" : "text-white"
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

        {reply && (
          <div
            key={reply.text}
            className="animate-ai-rise max-w-2xl rounded-dash border border-white/10 bg-black/55 px-5 py-3.5 backdrop-blur-xl"
          >
            <p className="text-[clamp(0.9375rem,0.85rem+0.35vw,1.1875rem)] leading-relaxed font-medium text-white">
              {reply.text}
            </p>
            {reply.synthetic && (
              <p className="mt-2 text-[0.6875rem] font-bold tracking-[0.1em] text-amber-300 uppercase">
                Generated figure, not a measured one
              </p>
            )}
          </div>
        )}

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

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setStage("compact")}
            aria-label="Put Poll360 AI in the corner"
            title="Put it in the corner"
            className="shrink-0 rounded-full transition-transform hover:scale-105"
          >
            <Orb mode={mode} size={52} />
          </button>

          {/* The caption, at the size a television uses, because the person
              who asked is usually not at the keyboard. Never blank, so the
              line never changes height. */}
          <p className="min-w-0 flex-1 truncate text-[clamp(1.0625rem,0.9rem+0.7vw,1.625rem)] leading-tight font-semibold tracking-[-0.02em] text-white">
            {heard ? <span>“{heard}”</span> : <span className="text-white/45">{status}…</span>}
          </p>

          <div className="flex shrink-0 items-center gap-1.5">{controls(false)}</div>
        </div>

        {typing && <div className="animate-ai-rise">{keys}</div>}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Control({ icon: Icon, label, onClick, on, live, danger, small }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={on ? true : undefined}
      className={cn(
        "relative flex items-center justify-center rounded-full border backdrop-blur transition-colors",
        small ? "size-8" : "size-11",
        danger
          ? "border-white/15 bg-black/40 text-white/70 hover:border-red-400/60 hover:bg-red-500/20 hover:text-white"
          : on
            ? "border-white/70 bg-white text-black"
            : "border-white/15 bg-black/40 text-white/70 hover:border-white/40 hover:text-white"
      )}
    >
      <Icon size={small ? 14 : 17} strokeWidth={2.25} />
      {live && (
        <span
          aria-hidden="true"
          className={cn(
            "animate-pulse-live absolute -top-0.5 -right-0.5 rounded-full bg-red-500",
            small ? "size-2" : "size-2.5"
          )}
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
