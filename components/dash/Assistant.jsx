"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Ear,
  EarOff,
  Globe,
  History,
  Keyboard,
  Loader2,
  Mic,
  PhoneOff,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";

import { STARTERS, ask, knowsAbout } from "@/lib/assistant";
import { DRIVING_STARTERS, WAKE, bestHeard, drive, harvest, repair, topics } from "@/lib/commands";
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

/**
 * The language recognition is asked for.
 *
 * ── WHY THIS IS NOT en-NG, WHEN THE VOICE IS ───────────────────────────────
 * Reading out and listening in are served by two different things with two
 * different language lists, and they were both set to "en-NG" as though they
 * were one setting. Nigerian English is offered for reading out, and it is
 * still asked for there, because a Nigerian place name in a General American
 * voice is often unrecognisable.
 *
 * It is not offered for listening in. Chrome's speech input serves en-GB,
 * en-US, en-AU, en-IN, en-ZA and a handful more, and en-NG is not among them.
 * Asking for a model that does not exist is one of the documented ways to be
 * handed a bare "network" error, which says nothing about the real problem and
 * sends everybody hunting for a connection that was never down. British
 * English is the closest model actually served, and Nigerian English is
 * British-descended, so it is also the one that transcribes best here.
 */
const HEARD_IN = "en-GB";

/**
 * The marker that carries a call across a change of dashboard.
 *
 * ── WHY A CALL SURVIVES NAVIGATION, WHEN NOTHING ELSE OPENS A MICROPHONE ───
 * The assistant is mounted by each dashboard's own chrome, so sending
 * somebody from the situation room to the field desk unmounts it, and with it
 * goes the call. "Take me to the field desk" therefore worked exactly once,
 * and then left the person pressing a button again to say the next thing —
 * which rather defeats being able to drive the product by voice.
 *
 * This is the one thing in here that reopens a microphone without somebody
 * pressing for it, and it is worth being clear about why that is not the
 * thing this product refuses to do. It does not start a call. It continues
 * one already running, across a move that was itself asked for out loud, in
 * the same breath. Nothing sets it but an instruction to change dashboard,
 * it is read once and cleared immediately, and it does not survive a hang up
 * or a closed tab.
 */
const RESUMING = "poll360:call-in-progress";

/* Whether the room left it listening for its name. Deliberately persistent:
   a wall display signed in once at six in the evening should not need somebody
   to walk over and re-arm it after every refresh. */
const WAKE_KEY = "poll360:wake-word";

/* How much of the conversation the history panel keeps. An eleven-hour shift
   with the wake word armed is a lot of turns, and nobody scrolls back past a
   few. Holding all of them costs memory to render a list no one reads. */
const TURN_LIMIT = 60;

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
  /* Something is being fetched from outside the product. The only thing in
     here that can take longer than a moment, so the only thing that needs
     saying so. */
  const [busy, setBusy] = useState(false);
  /**
   * Whether it is listening for its own name.
   *
   * ── THIS IS THE ONE THING IN HERE WORTH ARGUING ABOUT ────────────────────
   * Everything else about this assistant was built on the position that a
   * microphone which opens itself is a microphone nobody trusts, and in a
   * situation room it is a microphone in the corner of a conversation about
   * an unreleased result. Being able to say its name and have it answer means
   * something is listening the rest of the time, and no amount of engineering
   * makes that untrue.
   *
   * What it does mean is made as narrow and as visible as it can be:
   *
   *   It is off until somebody turns it on, every time it is turned on it
   *   asks for the microphone by name, and it stays off across a reload
   *   unless it was deliberately left on.
   *
   *   While armed, nothing heard is displayed, kept, answered or sent
   *   anywhere. The only question asked of the audio is whether the name is
   *   in it. Everything else falls on the floor unread.
   *
   *   Where the browser can recognise speech on the device, it does, so the
   *   waiting happens on this machine and not on somebody's server.
   *
   *   It says so, permanently and in the open, whenever it is armed. A
   *   listening indicator that can be missed is worse than none.
   */
  const [armed, setArmed] = useState(false);
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
  const lookUpRef = useRef(null);
  /* The last thing said, so "put that on the board" has a "that". */
  const lastAnswer = useRef(null);
  const linger = useRef(null);
  /* Whether the microphone itself was granted. It is the difference between
     "you cannot have a microphone" and "you have a microphone, and this
     browser will not let a page run speech recognition with it", which are
     different problems with different answers and were being told apart by
     nobody. */
  const micGranted = useRef(false);
  /* True from the moment an answer is decided until it has finished being
     read out. The recogniser is left open between utterances now, so this is
     what stops it hearing the assistant and answering its own voice. */
  const holding = useRef(false);
  /* Consecutive "network" failures. Chrome throws one on a first attempt
     often enough that treating it as fatal is simply wrong. */
  const networkTries = useRef(0);
  /**
   * Which batch of speech is the current one.
   *
   * ── WHY A COUNTER AND NOT A FLAG ─────────────────────────────────────────
   * Every answer starts by cancelling whatever is still being read out. That
   * cancellation fires `onerror` on each utterance still queued from the
   * previous answer — and those handlers were still live, so the answer that
   * had just been superseded would run its own finish: release the hold and
   * reopen the microphone, on top of the answer now being read. Two quick
   * questions in a row was all it took, and the assistant would hear itself
   * and answer its own voice.
   *
   * Each batch takes a number on the way in. A finish belonging to an older
   * number does nothing at all.
   */
  const speechGen = useRef(0);
  /* "wake" is waiting to be called by name and nothing else. "talk" is a
     conversation. One recogniser serves both: two would fight over the
     microphone, and the loser fails in a way that looks like a dead button. */
  const earMode = useRef("talk");
  const wokenRef = useRef(null);
  /* Whether the recogniser is actually open, as a ref rather than only as
     state: the watchdog below reads it several times a minute and must not
     re-run an effect to find out. */
  const listeningRef = useRef(false);
  /* What has already been fetched this session. Without it, a room that says
     "Atiku" eight times in a planning meeting fetches him eight times and
     puts eight identical cards up. */
  const looked = useRef(new Set());

  /* Speech lives on window, so this is read once at mount rather than in an
     effect. Nothing rendered before the overlay opens depends on it, so the
     server and the client still agree on the first paint. */
  /**
   * What this browser can actually do.
   *
   * ── WHY THIS IS NOT READ WHILE RENDERING ─────────────────────────────────
   * It used to be, in a `useState` initialiser guarded by `typeof window`.
   * That guard is the bug, not the fix: the initialiser runs on the server,
   * where it is false, and again on the client during hydration, where it is
   * true. The two renders disagree, and React throws the markup away and
   * rebuilds the tree.
   *
   * It went unnoticed for as long as nothing on the first paint depended on
   * it — every control it gated sat inside the overlay, which is closed until
   * somebody opens it. The moment a button on the launcher was gated the same
   * way, the mismatch had something to show and the warning arrived. It was
   * always wrong; it just had nowhere to surface.
   *
   * So the first client render matches the server exactly — no microphone, no
   * voice — and the real answer arrives a tick later, which is far sooner than
   * anybody can reach for the button.
   */
  const [canHear, setCanHear] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);

  useEffect(() => {
    const check = setTimeout(() => {
      setCanHear(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
      setCanSpeak("speechSynthesis" in window);
    }, 0);
    return () => clearTimeout(check);
  }, []);

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
        holding.current = false;
        if (thenListen) startListening();
        return;
      }

      const generation = (speechGen.current += 1);
      window.speechSynthesis.cancel();

      /* ── WHY THERE IS A DEADLINE ───────────────────────────────────────
         Speech synthesis does not always finish. A device with no voice
         installed, a tab that loses focus mid-sentence, an engine still
         warming up: in each case `onend` never arrives, and without a deadline
         the overlay would sit on "Speaking" and never re-open the microphone.
         Whichever lands first wins, and the finish only runs once. */
      let finished = false;
      const finish = () => {
        if (finished || speechGen.current !== generation) return;
        finished = true;
        clearTimeout(deadline);
        setSpeaking(false);
        /* Released before the microphone is reopened, never after: the guard
           in `onend` reads this, and a stale hold would leave the call up
           with nothing listening. */
        holding.current = false;
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
        if (index === lines.length - 1) utterance.onend = finish;

        /* ── A SENTENCE THAT FAILS TAKES THE REST WITH IT ────────────────
           An error partway through used to run the finish on its own, which
           released the hold and reopened the microphone while the sentences
           behind it were still queued and still about to be read out. The
           rest of the batch is dropped first, so what the microphone comes
           back to is silence rather than the tail of an answer. */
        utterance.onerror = () => {
          if (finished || speechGen.current !== generation) return;
          window.speechSynthesis.cancel();
          finish();
        };

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
        /* Only while the microphone is actually open. A typed instruction to
           change dashboard should land on a quiet one, the same as clicking
           the link would. */
        if (wantsMic.current) {
          try {
            sessionStorage.setItem(RESUMING, "1");
          } catch {
            /* Storage refused. The call simply ends at the navigation, which
               is what it did before any of this. */
          }
        }
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

  /**
   * Shut the microphone because something is about to be read out.
   *
   * Both the answering path and the looking-up path need this, and they used
   * to do it inline. Written twice, it was correct twice and would have
   * drifted the moment either changed.
   */
  const shutMicrophone = useCallback(() => {
    if (!wantsMic.current) return;
    holding.current = true;
    try {
      recognition.current?.stop();
    } catch {
      /* Already stopping. */
    }
  }, []);

  const respond = useCallback(
    (question) => {
      const text = question.trim();
      if (!text) return;

      /* ── THE MICROPHONE IS SHUT FOR EVERY ANSWER, NOT JUST SPOKEN ONES ──
         The session is left open between utterances now, so a question typed
         while the call is up would otherwise leave the microphone listening
         to the answer being read back, and the assistant would answer itself.
         Whether the question was typed or said makes no difference to that. */
      shutMicrophone();

      /* ── "NO, I MEANT ATIKU" ────────────────────────────────────────────
         A correction is not a new question, it is the old one with the
         misheard word replaced. Everything below runs on the corrected
         phrase; the transcript still shows what was actually said, so
         nobody is left wondering whether it heard the repair either. */
      const fixed = repair(text);
      const intended = fixed ?? text;

      /* An instruction first, a question second. The command reader is strict
         and returns nothing unless it is confident, so anything it declines
         falls through to being answered, which is the safe direction. */
      const order = drive(intended, {
        tabs: room?.tabs ?? [],
        path: room?.path ?? [],
        lgas: room?.lgas ?? [],
        /* Which surface is open changes what a bare noun means. On the board,
           naming a thing is asking for it; anywhere else it is not. */
        tab,
      });

      /* Off the product entirely, and asked for in so many words. */
      if (order?.act.do === "lookup") {
        lookUpRef.current?.(order.act.query, { asked: text });
        return;
      }

      const carried = order ? carryOut(order) : null;

      /* ── A NAME WITH NO VERB WANTS BOTH ────────────────────────────────
         Saying "Ekiti" moves the map and asks a question at the same time.
         The move is made by the instruction, and the answer read out is the
         full one rather than the one-line headline a deliberate "take me to"
         gets, because the question was the point and the move was incidental. */
      const asked = !order || order.alsoAnswer ? ask(intended, { tab, projection }) : null;

      const answer =
        carried && asked && asked.kind !== "unknown"
          ? { ...carried, text: asked.text, follow: asked.follow, kind: asked.kind }
          : (carried ?? asked);

      /* ── DO NOT REFUSE AND THEN ANSWER OVER YOURSELF ────────────────────
         An unknown question used to be answered "I do not have that one, and
         I would rather say so than guess", read out in full — and then the
         web lookup landed and spoke straight over the top of it. The room
         heard a refusal interrupted by an answer, which is a worse experience
         than either on its own.

         So when it is about to go and look, it says it is going to look, and
         the refusal is held back as the thing to say only if nothing comes
         back. One question, one answer, in one voice. */
      /* ── ONLY GO OUTSIDE FOR SOMETHING GENUINELY OUTSIDE ────────────────
         Not understanding a question about the count is not the same as the
         question being about something else, and conflating them is how a
         room asking about a Nigerian state ends up being read an encyclopaedia
         entry about it while the declared figures sit unused. If the sentence
         mentions anything this product knows — a state, a party, a candidate,
         a zone, any term in its own vocabulary — an unknown answer means the
         phrasing missed, and the honest reply is to say so. */
      const willLook = answer.kind === "unknown" && !knowsAbout(text);
      const said = willLook ? `Let me look that up.` : answer.text;

      lastAnswer.current = answer.text;
      setHeard("");
      setReply(willLook ? { ...answer, text: said } : answer);
      setTurns((previous) =>
        [...previous, { role: "you", text }, { role: "ai", ...answer, text: said }].slice(-TURN_LIMIT)
      );
      /* Listening resumes if the call is up, however the question arrived. */
      speak(said, { thenListen: wantsMic.current && !willLook });

      /* ── IT GETS OUT OF THE WAY THE MOMENT IT HAS BEEN USEFUL ──────────
         Saying hello to it, or asking what it can do, is a question about
         the assistant, so it stays open. Everything else is a question
         about the election or an instruction to move the room, and the
         answer to both is behind the overlay. */
      const aboutItself = answer.kind === "identity" || answer.kind === "help";
      setStage(aboutItself ? "full" : "compact");

      /* ── WHAT THIS PRODUCT DOES NOT KNOW, SOMEBODY ELSE MIGHT ───────────
         Refusing everything outside the count is honest but it closes the
         board halfway through most real conversations, and the person
         reaches for their phone — where what they read never reaches the
         room at all. So an unknown question goes to the web, and comes back
         labelled as having come from there. */
      if (willLook) lookUpRef.current?.(intended, { fallback: answer.text });

      /* ── THE BOARD KEEPS UP WITH THE CONVERSATION ───────────────────────
         This used to require standing on the board for anything to be put
         up, which got the purpose of the thing backwards: the board is for
         planning, and a planning conversation ranges across states, people
         and institutions faster than anybody can ask for each one to be
         written down. Asking is the part worth removing.

         So while there is a call up, everything named goes on the board, and
         the board is never brought to the front to show it. Quiet is the
         whole point — a screen that rearranges itself under a conversation
         it was not addressed by is worse than one that does nothing. It is
         there when they look. */
      if (room?.run) {
        for (const spec of harvest(intended)) room.run({ do: "pin", card: spec, quiet: true });
      }

      /* ── AND WHAT WE CANNOT COMPUTE, WE GO AND FETCH ────────────────────
         A face for a name, a line on an institution, a photograph of a
         place: the things a planning conversation reaches for and this
         product has no column for. One per utterance, never the same thing
         twice in a session, and never a word said about it. */
      for (const topic of topics(intended)) {
        if (looked.current.has(topic.key)) continue;
        looked.current.add(topic.key);
        lookUpRef.current?.(topic.look, { silent: true, note: topic.note });
        break;
      }

      clearTimeout(linger.current);
      /* The big card clears itself so a room that walked away is not left
         reading an hour-old sentence in 24-point type. The small one keeps
         the last answer: it is out of the way, and being able to look back
         at what was just said is worth more there than tidiness. */
      if (aboutItself) linger.current = setTimeout(() => setReply(null), LINGER);
    },
    [room, carryOut, tab, projection, speak, shutMicrophone]
  );

  /**
   * Ask the web, and put what comes back on the board.
   *
   * ── IT GOES ON THE BOARD EVEN WHEN THE BOARD IS NOT OPEN ─────────────────
   * A reference read out and not written down is a reference somebody has to
   * ask for twice. It is pinned wherever the person happens to be standing,
   * and they are told it is there, so the board is already right when they
   * get to it.
   *
   * ── AND IT IS NEVER PRESENTED AS OURS ────────────────────────────────────
   * What is read out names the source in the same breath as the answer, for
   * the same reason the card is drawn in a different colour: on a desk that
   * may be reading this on air, "Wikipedia says" and "the result was" are not
   * interchangeable openings, and the difference cannot be left to whoever is
   * listening to infer.
   */
  const lookUp = useCallback(
    async (query, { quiet = false, fallback = null, silent = false, note = null } = {}) => {
      const wanted = String(query ?? "").trim();
      if (!wanted) return;

      /* ── SILENT IS FOR THINGS NOBODY ASKED FOR OUT LOUD ─────────────────
         The board fills itself from what the room is discussing, and that
         must never interrupt the discussion. A silent lookup puts a card up
         and says nothing at all: no holding line, no reading it out, no
         change to what is on the overlay. If it finds nothing, nothing
         happens, which is the correct amount of noise for a question that
         was never asked. */
      if (!silent) setBusy(true);
      if (!quiet && !silent) setReply({ text: `Looking up ${wanted}.`, kind: "drive" });

      let data = null;
      try {
        const response = await fetch(`/api/lookup?q=${encodeURIComponent(wanted)}`);
        data = await response.json().catch(() => null);
        if (!response.ok) {
          /* ── A SESSION THAT HAS RUN OUT IS NOT A MISSING ARTICLE ────────
             This is the one failure here that has nothing to do with what
             was asked, and reporting it as "I could not find anything on
             Atiku Abubakar" would send somebody looking for a spelling
             mistake for as long as it took them to give up. An eleven-hour
             shift outlasts a session, so it will happen. */
          data = {
            found: false,
            error:
              response.status === 401
                ? "You have been signed out, so I cannot look anything up. Sign in again in another tab and I will carry on."
                : (data?.error ?? null),
          };
        }
      } catch {
        data = { found: false, unreachable: true };
      } finally {
        if (!silent) setBusy(false);
      }

      if (!data?.found) {
        if (quiet || silent) return;
        /* ── THE REFUSAL THAT WAS HELD BACK ─────────────────────────────
           If this ran because the product did not know the answer, the
           honest sentence about not knowing was never said — it was held
           for exactly this moment. Saying it now, once, is the whole point
           of holding it. */
        const miss =
          data?.error ??
          fallback ??
          (data?.unreachable
            ? "I could not reach the reference just now."
            : `I could not find anything on ${wanted}.`);
        setReply({ text: miss, kind: "drive" });
        setTurns((previous) => [...previous, { role: "ai", text: miss, kind: "drive" }].slice(-TURN_LIMIT));
        shutMicrophone();
        speak(miss, { thenListen: wantsMic.current });
        return;
      }

      const onBoard = Boolean(room?.run);
      if (onBoard) {
        room.run({
          do: "pin",
          /* A note from our own list beats the encyclopaedia's one-liner:
             "PDP candidate, 2023 presidential election" is what this room
             needs to see, and "Nigerian politician" is not. */
          card: { kind: "web", ...data, description: note ?? data.description },
          quiet: silent,
        });
      }

      /* Put up and said nothing about, because nobody asked. */
      if (silent) return;

      /* A word with several meanings is read out as a question, not as an
         answer, because that is what it is. Being told what it could mean
         and asked which, is right; being read a confident paragraph about
         one of them is not. */
      const spoken = data.ambiguous
        ? [
            `${data.title} means a few different things.`,
            data.extract,
            "Say which one and I will look it up properly.",
          ].join(" ")
        : [
            `${data.source} on ${data.title}.`,
            data.extract,
            onBoard ? "It is on the board." : null,
          ]
            .filter(Boolean)
            .join(" ");

      lastAnswer.current = spoken;
      setReply({ text: spoken, kind: "web", source: data.source, href: data.href });
      setTurns((previous) =>
        [...previous, { role: "ai", text: spoken, kind: "web", source: data.source }].slice(-TURN_LIMIT)
      );
      setStage("compact");

      shutMicrophone();
      speak(spoken, { thenListen: wantsMic.current });
    },
    [room, speak, shutMicrophone]
  );

  /**
   * Called by name.
   *
   * Whatever was said after the name is treated as the first thing asked,
   * because "Hi Poll360 AI, show me Ekiti" is one sentence to the person
   * saying it. Being greeted back and then having to repeat the instruction
   * is what makes people stop bothering.
   */
  const woken = useCallback(
    (said) => {
      const rest = said.replace(WAKE, " ").replace(/\s+/g, " ").trim();

      setOpen(true);
      setNotice(null);
      earMode.current = "talk";
      wantsMic.current = true;
      setCalling(true);

      if (rest.length > 1) {
        /* Straight to the point. The overlay opens on the answer rather than
           on a greeting nobody asked for. */
        setStage("compact");
        respondRef.current?.(rest);
        return;
      }

      setStage("full");
      const hello = "Yes?";
      setReply({ text: hello, kind: "greeting" });
      lastAnswer.current = hello;
      shutMicrophone();
      speak(hello, { thenListen: true });
    },
    [speak, shutMicrophone]
  );

  useEffect(() => {
    respondRef.current = respond;
    lookUpRef.current = lookUp;
    wokenRef.current = woken;
  });

  /* One recogniser for the life of the overlay. Rebuilding it per utterance
     loses the permission grant on some browsers and stutters on the rest. */
  useEffect(() => {
    if (!canHear) return undefined;

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const engine = new Recognition();
    engine.lang = HEARD_IN;
    /**
     * ── WHY IT STAYS OPEN NOW ────────────────────────────────────────────
     * This used to run with `continuous` off, which ends the session at every
     * pause in speech. The call was then kept alive by reopening it a third of
     * a second later, every time, which meant a fresh connection to the
     * browser's speech service several times a minute for as long as somebody
     * was talking. Chrome answers that churn by refusing, and the refusal it
     * sends is "network" — an error that reads as though the internet is down
     * when what actually happened is that we knocked too often.
     *
     * Left open, one session covers a whole conversation. It is closed
     * deliberately in exactly one place, when an answer is about to be read
     * out, and reopened when the reading finishes.
     */
    engine.continuous = true;
    engine.interimResults = true;
    /* ── ASK FOR THE RUNNERS-UP, NOT JUST THE WINNER ────────────────────
       A recogniser ranks its guesses on how English they sound, not on
       whether they mean anything here, so "Kano" loses to "canoe" and
       "Lagos" to "lagoon" more often than not. Reading only the top guess
       threw away the right answer while it was sitting in the same event.
       Five costs nothing and `bestHeard` knows which of them is about an
       election. */
    engine.maxAlternatives = 5;

    /**
     * ── ON THE DEVICE, WHERE THE BROWSER CAN DO IT ───────────────────────
     * Newer browsers can run recognition locally instead of shipping the
     * audio to a server. For this product that is not a nicety: the thing
     * being said out loud is very often an unreleased result, and the whole
     * assistant is built on nothing leaving the machine. It also removes the
     * failure above outright, because there is no service left to be refused
     * by. Where the browser has no such thing, every line of this is skipped
     * and the remote service is used exactly as before.
     */
    const available = Recognition.availableOnDevice;
    if (typeof available === "function") {
      Promise.resolve(available.call(Recognition, HEARD_IN))
        .then((state) => {
          if (state === true || state === "available") {
            engine.processLocally = true;
            return null;
          }
          if (state === "downloadable" && typeof Recognition.installOnDevice === "function") {
            /* Fetched in the background. Nothing waits on it: this call is
               already working over the network, and the local model simply
               takes over next time. */
            return Recognition.installOnDevice(HEARD_IN);
          }
          return null;
        })
        .catch(() => {
          /* An older browser, or a model that will not install. The remote
             service is still there, so there is nothing to report. */
        });
    }

    engine.onstart = () => {
      listeningRef.current = true;
      setListening(true);
      /* It connected, so whatever went wrong before is over. */
      networkTries.current = 0;
    };

    engine.onend = () => {
      listeningRef.current = false;
      setListening(false);
      /* A session can still end on its own, on a long silence or when the
         service drops. If the call is up and nothing is being read out, open
         it again so the room can keep talking without pressing anything. */
      if (wantsMic.current && !holding.current) {
        setTimeout(() => wantsMic.current && !holding.current && startListening(), 400);
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

      /* ── A DEAD EAR MUST NOT STILL SAY "LISTENING" ─────────────────────
         Waiting for the name happens with the overlay closed, where a notice
         has nowhere to appear. So a wake listener that gives up would leave
         the launcher reading "Listening for its name" over a microphone that
         had stopped — the indicator claiming something untrue, which is the
         single failure that would make every other promise about it worth
         nothing. If the ear dies, the arming goes with it, visibly. */
      if (earMode.current === "wake") {
        setArmed(false);
        try {
          localStorage.setItem(WAKE_KEY, "0");
        } catch {
          /* No storage. It is disarmed for this session regardless. */
        }
      }
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

        case "network": {
          /* ── TRANSIENT UNTIL PROVEN OTHERWISE ──────────────────────────
             Chrome throws this on a first attempt often enough that treating
             it as fatal was simply wrong: the connection is usually fine and
             the next attempt works. It is only reported after it has failed
             three times running, backing off in between, and even then it is
             reported as what it is rather than as a flat statement that the
             machine is offline. */
          networkTries.current += 1;
          if (networkTries.current <= 3 && wantsMic.current) {
            setNotice(null);
            const wait = 600 * networkTries.current;
            setTimeout(() => wantsMic.current && !holding.current && startListening(), wait);
          } else {
            stop(
              navigator.onLine === false
                ? "This machine is offline, and the browser sends what it hears away to be read. Type instead, and everything still works."
                : "The browser cannot reach its speech service. That is between your network and the browser, not this page, and it is often a VPN or a company network in the way. Type instead, and nothing else changes."
            );
          }
          break;
        }

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
        const guesses = Array.from(result, (alternative) => alternative.transcript);

        /* ── WAITING TO BE CALLED ─────────────────────────────────────────
           The only question asked of anything heard here is whether the name
           is in it. Nothing is displayed, nothing is kept, nothing is
           answered, and the transcript is not looked at again. Checking
           interim results as well as final ones is what makes it answer on
           the name rather than a second after the sentence has finished. */
        if (earMode.current === "wake") {
          /* Any guess carrying the name is a call. The product's name is not
             an English word, so it is routinely ranked second or third behind
             something that is — which is exactly why reading only the top
             guess meant it so often did not answer to its own name. */
          if (guesses.some((text) => WAKE.test(text))) {
            wokenRef.current?.(bestHeard(guesses, { wake: true }));
            return;
          }
          continue;
        }

        if (result.isFinal) {
          const said = bestHeard(guesses).trim();
          setHeard(said);
          networkTries.current = 0;

          /* The one place the session is closed on purpose. Held shut until
             the answer has finished being read out, so `onend` does not race
             the start of speech and reopen the microphone into it. */
          holding.current = true;
          try {
            engine.stop();
          } catch {
            /* Already stopping. */
          }

          respondRef.current?.(said);
          return;
        }
        interim += result[0].transcript;
      }
      if (earMode.current !== "wake") setHeard(interim);
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
    /* ── THE EAR MAY ALREADY BE OPEN ────────────────────────────────────
       Pressing the button while it is armed means a wake session is already
       running, and nothing here used to close it — so the greeting was read
       out into a live microphone and it heard itself say hello. Shutting it
       first costs nothing when it was not open, and everything when it was. */
    shutMicrophone();
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
    /* Not named `armed`: that is the wake-word state, and a local of the same
       name shadowing it inside the one function that also opens a call is a
       trap for whoever reads this next. */
    const gotIt = await takeMicrophone({ listenNow: false });
    speak(GREETING, { thenListen: gotIt });
  };

  const endCall = useCallback(() => {
    wantsMic.current = false;
    /* Both cleared here and nowhere else. A hold left set from an answer that
       was interrupted would keep the microphone shut through the next call,
       and a failure count left standing would spend the next call's retries
       before it had made a single attempt. */
    holding.current = false;
    networkTries.current = 0;
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

  /**
   * Turn listening for the name on or off.
   *
   * Arming asks for the microphone by name every time, rather than assuming
   * an earlier grant still stands. If it is refused, nothing is armed and the
   * refusal explains itself — the state never claims to be listening when it
   * is not, which is the one failure that would make the indicator a lie.
   */
  const arm = useCallback(
    async (on) => {
      if (!on) {
        setArmed(false);
        try {
          localStorage.setItem(WAKE_KEY, "0");
        } catch {
          /* No storage. It simply will not be remembered. */
        }
        if (!open) endCall();
        return;
      }

      const allowed = await askForMicrophone();
      if (!allowed) return;

      setArmed(true);
      try {
        localStorage.setItem(WAKE_KEY, "1");
      } catch {
        /* No storage. Armed for this session only. */
      }
    },
    [open, askForMicrophone, endCall]
  );

  /* What the room left switched on. Read after the first paint, never during
     it: local storage does not exist on the server, and a page that renders
     "listening" on one side and "not listening" on the other is a page React
     is entitled to throw away and rebuild. */
  useEffect(() => {
    const load = setTimeout(() => {
      try {
        if (localStorage.getItem(WAKE_KEY) === "1") setArmed(true);
      } catch {
        /* No storage. Starts disarmed, which is the safe direction. */
      }
    }, 0);
    return () => clearTimeout(load);
  }, []);

  /**
   * Keep the ear pointed at the right thing.
   *
   * Open means a conversation. Closed and armed means waiting for the name.
   * Closed and disarmed means nothing at all, and the microphone is released
   * rather than merely ignored.
   */
  useEffect(() => {
    if (!canHear) return undefined;

    if (open) {
      earMode.current = "talk";
      return undefined;
    }
    if (!armed) return undefined;

    earMode.current = "wake";
    wantsMic.current = true;
    holding.current = false;
    const start = setTimeout(() => startListening(), 0);
    return () => clearTimeout(start);
  }, [armed, open, canHear, startListening]);

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

  /**
   * Make sure the ear is actually open when it is supposed to be.
   *
   * ── WHY SOMETHING HAS TO CHECK ───────────────────────────────────────────
   * Every path that reopens the microphone can fail silently. `start()`
   * throws if the engine is still winding down from the last session, and the
   * throw is caught and ignored because a double start is a normal race. A
   * session ends on its own after a long silence and is reopened on a timer,
   * and that timer can land in exactly that window. A speech engine that
   * never fires `onend` leaves the reopen waiting for an event that is not
   * coming.
   *
   * Each of those is rare. Together, over an evening, they are why it stops
   * answering to its name with nothing on screen to say why — the worst kind
   * of fault, because the indicator still says it is listening and the person
   * is left talking to something that stopped hours ago.
   *
   * Rather than chase each race, this asks a question none of them can lie
   * about: should it be listening, and is it? If the answer is no and yes, it
   * opens it again. Every path is allowed to fail, because this catches all
   * of them.
   */
  useEffect(() => {
    if (!canHear) return undefined;

    const beat = setInterval(() => {
      if (!wantsMic.current || holding.current || listeningRef.current) return;
      if (typeof window !== "undefined" && window.speechSynthesis?.speaking) return;
      startListening();
    }, 3000);

    return () => clearInterval(beat);
  }, [canHear, startListening]);

  /**
   * Pick the call back up on the other side of a change of dashboard.
   *
   * The marker is read once and cleared before anything else happens, so a
   * failure here cannot leave a page that reopens the microphone every time
   * it is loaded. Nothing is said on arrival: the person asked to be moved,
   * they can see they have been moved, and being told so is one sentence in
   * the way of the next thing they wanted to say.
   */
  useEffect(() => {
    let taken = false;
    try {
      taken = sessionStorage.getItem(RESUMING) === "1";
      if (taken) sessionStorage.removeItem(RESUMING);
    } catch {
      /* No storage. Nothing to resume. */
    }
    if (!taken || !canHear) return undefined;

    /* Off the effect body deliberately: this opens the overlay and takes the
       microphone, and doing that synchronously inside an effect is a
       cascading render the moment the page has finished its first. */
    let live = true;
    const start = setTimeout(() => {
      if (!live) return;
      setOpen(true);
      setStage("compact");
      takeMicrophone();
    }, 0);

    return () => {
      live = false;
      clearTimeout(start);
    };
  }, [canHear, takeMicrophone]);

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

  const mode = speaking
    ? "speaking"
    : listening
      ? "listening"
      : busy || calling
        ? "thinking"
        : "idle";
  /* ── THE STATUS LINE, SHARED BY BOTH SIZES ─────────────────────────────── */
  const status = speaking
    ? "Speaking"
    : listening
      ? "Listening"
      : busy
        ? "Looking it up"
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
      {canHear && (
        /* Armed or not, reachable from inside the call as well as outside it.
           Somebody who has just finished with it is exactly who wants to
           decide whether it keeps listening, and making them hang up first to
           find the switch is how it ends up left on by accident. */
        <Control
          icon={armed ? Ear : EarOff}
          label={armed ? "Stop answering to its name" : "Answer to “Hi Poll360 AI”"}
          on={armed}
          small={small}
          onClick={() => arm(!armed)}
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
      <div className="fixed right-5 bottom-5 z-40 flex items-center gap-1.5 rounded-full border border-white/10 bg-dash-ink/95 p-1.5 pr-2 text-white shadow-e4 backdrop-blur">
        <button
          type="button"
          onClick={beginCall}
          className="group flex items-center gap-3 rounded-full pr-3 pl-1 transition-transform hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red"
        >
          <Orb mode={armed ? "listening" : "idle"} size={34} />
          <span className="text-left">
            <span className="block text-[0.8125rem] leading-tight font-extrabold">Hi Poll360 AI</span>
            <span className="block text-[0.625rem] leading-tight text-white/60">
              {/* ── THE INDICATOR IS NOT DECORATION ────────────────────────
                  While it is armed there is a live microphone in the room,
                  and the only honest thing to do is say so where nobody has
                  to look for it. This line is the difference between a
                  feature somebody switched on and a feature somebody has
                  forgotten about. */}
              {armed ? "Listening for its name" : "Ask it, or tell it where to go"}
            </span>
          </span>
        </button>

        {canHear && (
          <button
            type="button"
            onClick={() => arm(!armed)}
            aria-pressed={armed}
            aria-label={
              armed ? "Stop listening for the wake word" : "Listen for “Hi Poll360 AI”"
            }
            title={
              armed
                ? "Listening for its name. Nothing is kept or answered until it hears it."
                : "Let it answer to “Hi Poll360 AI” without being pressed"
            }
            className={cn(
              "relative flex size-8 shrink-0 items-center justify-center rounded-full transition-colors",
              armed
                ? "bg-brand-red text-white"
                : "border border-white/15 text-white/60 hover:border-white/40 hover:text-white"
            )}
          >
            {armed ? <Ear size={14} strokeWidth={2.25} /> : <EarOff size={14} strokeWidth={2.25} />}
            {armed && (
              <span
                aria-hidden="true"
                className="animate-pulse-live absolute -top-0.5 -right-0.5 size-2 rounded-full bg-white"
              />
            )}
          </button>
        )}
      </div>
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

            {/* Read off somebody else's page, and said so in the same glance
                as the words themselves. On a desk that may be reading this
                out, where it came from is not a footnote. */}
            {reply?.kind === "web" && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[0.625rem] font-bold tracking-[0.1em] text-amber-300 uppercase">
                <Globe size={10} strokeWidth={2.5} />
                {reply.source ?? "From the web"} · not our data
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
            {reply.kind === "web" && (
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem] font-bold tracking-[0.1em] text-amber-300 uppercase">
                <Globe size={11} strokeWidth={2.5} />
                {reply.source ?? "From the web"} · not this product&rsquo;s data
                {reply.href && (
                  <a
                    href={reply.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline underline-offset-2 hover:text-amber-100"
                  >
                    Open it
                  </a>
                )}
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
