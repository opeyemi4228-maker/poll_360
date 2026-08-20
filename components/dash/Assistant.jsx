"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Mic, MicOff, Send, Sparkles, Volume2, VolumeX, X } from "lucide-react";

import { STARTERS, ask } from "@/lib/assistant";
import { cn } from "@/lib/utils";

/**
 * Poll360 AI, the talking half.
 *
 * ── WHY A CALL, AND WHY IT HAS TO BE PRESSED ───────────────────────────────
 * A microphone that opens itself is a microphone nobody trusts, and in a
 * situation room it is a microphone recording a conversation about a live
 * result. So this behaves like a call: it is silent until somebody presses
 * "Hi Poll360 AI", it shows unmistakably when it is listening, and hanging up
 * releases the microphone rather than merely hiding the panel.
 *
 * Speaking and listening are never on at once. Recognition stops while an
 * answer is being read out and starts again when it finishes, because the
 * alternative is the assistant hearing itself and answering its own voice.
 *
 * ── IT RUNS ON THE DEVICE ──────────────────────────────────────────────────
 * Speech in and speech out are the browser's own. Nothing leaves the machine,
 * which matters when the thing being discussed is an unreleased result. On a
 * browser without speech recognition the panel keeps working and says why,
 * because a room on a locked-down laptop still needs the answers.
 * ───────────────────────────────────────────────────────────────────────────
 */

const GREETING =
  "Poll360 AI here. I answer from the declared 2023 result and the live projection, and I will tell you when a figure is generated rather than measured. What would you like to know?";

export default function Assistant({ tab = "results", projection = null }) {
  const [open, setOpen] = useState(false);
  const [calling, setCalling] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [heard, setHeard] = useState("");
  const [typed, setTyped] = useState("");
  const [notice, setNotice] = useState(null);
  const [turns, setTurns] = useState([]);

  const recognition = useRef(null);
  const wantsMic = useRef(false);
  const log = useRef(null);
  /* The recogniser is built once and must survive every re-render, but the
     handler it calls changes whenever the room moves a slider. The ref is the
     seam between the two: rebuilding the recogniser to pick up a new closure
     would drop the microphone mid-sentence. */
  const answerRef = useRef(null);

  /* Speech lives on window, so this is read once at mount rather than in an
     effect. Nothing rendered before the panel opens depends on it, so the
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
      if (!canSpeak || muted) {
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
         installed, a tab that loses focus mid-sentence, an engine that is
         still warming up: in each case `onend` simply never arrives, and
         without a deadline the panel would sit on "Speaking" and never
         re-open the microphone. Whichever lands first wins, and the finish
         only runs once. */
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

  const answer = useCallback(
    (question, { spoken = false } = {}) => {
      const text = question.trim();
      if (!text) return;

      const reply = ask(text, { tab, projection });
      setTurns((previous) => [
        ...previous,
        { role: "you", text },
        { role: "ai", text: reply.text, kind: reply.kind, synthetic: reply.synthetic, follow: reply.follow },
      ]);
      setHeard("");
      speak(reply.text, { thenListen: spoken });
    },
    [tab, projection, speak]
  );

  useEffect(() => {
    answerRef.current = answer;
  });


  /* One recogniser for the life of the panel. Rebuilding it per utterance
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
          answerRef.current?.(said, { spoken: true });
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
    if (!turns.length) setTurns([{ role: "ai", text: GREETING, kind: "greeting" }]);
    speak(GREETING, { thenListen: canHear });
    if (canHear) {
      wantsMic.current = true;
      setCalling(true);
      startListening();
    } else {
      setNotice("This browser cannot listen, so speak by typing. Chrome and Edge can hear you.");
    }
  };

  const endCall = () => {
    wantsMic.current = false;
    setCalling(false);
    setListening(false);
    setHeard("");
    try {
      recognition.current?.stop();
    } catch {
      /* Already stopped. */
    }
    if (canSpeak) window.speechSynthesis.cancel();
    setSpeaking(false);
  };

  useEffect(() => () => endCall(), []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Newest turn in view without yanking the page around it. */
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [turns, heard]);

  const last = turns[turns.length - 1];
  const suggestions = useMemo(
    () => (last?.role === "ai" && last.follow?.length ? last.follow : STARTERS),
    [last]
  );

  /* ------------------------------------------------------------- launcher */
  if (!open) {
    return (
      <button
        type="button"
        onClick={beginCall}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2.5 rounded-full bg-dash-ink py-3 pl-4 pr-5 text-white shadow-lg transition-transform hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red"
      >
        <span className="relative flex size-6 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-brand-red/40" aria-hidden="true" />
          <Sparkles size={16} strokeWidth={2.5} className="relative" />
        </span>
        <span className="text-left">
          <span className="block text-[0.8125rem] font-extrabold leading-tight">Hi Poll360 AI</span>
          <span className="block text-[0.625rem] leading-tight text-white/70">
            Tap to talk, or type
          </span>
        </span>
      </button>
    );
  }

  /* ---------------------------------------------------------------- panel */
  return (
    <section
      aria-label="Poll360 AI"
      className="fixed bottom-5 right-5 z-40 flex h-[min(38rem,calc(100vh-6rem))] w-[min(26rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-dash border border-dash-line bg-dash-card shadow-2xl"
    >
      <header className="flex shrink-0 items-center gap-2.5 border-b border-dash-line px-4 py-3">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            calling ? "bg-brand-red text-white" : "bg-dash-ink text-white"
          )}
        >
          <Sparkles size={15} strokeWidth={2.5} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block font-display text-[0.875rem] font-extrabold leading-tight text-dash-ink">
            Poll360 AI
          </span>
          <span className="flex items-center gap-1.5 text-[0.6875rem] leading-tight text-dash-muted">
            {speaking ? (
              <>
                <Volume2 size={11} strokeWidth={2.5} /> Speaking
              </>
            ) : listening ? (
              <>
                <span className="size-1.5 animate-pulse rounded-full bg-brand-red" aria-hidden="true" />
                Listening
              </>
            ) : calling ? (
              <>
                <Loader2 size={11} className="animate-spin" /> On call
              </>
            ) : (
              "Type a question, or start a call"
            )}
          </span>
        </span>

        {canSpeak && (
          <button
            type="button"
            onClick={() => {
              setMuted((previous) => !previous);
              if (!muted) window.speechSynthesis.cancel();
            }}
            aria-label={muted ? "Turn the voice back on" : "Mute the voice"}
            className="rounded-dash p-1.5 text-dash-muted transition-colors hover:bg-dash-bg hover:text-dash-ink"
          >
            {muted ? <VolumeX size={15} strokeWidth={2.25} /> : <Volume2 size={15} strokeWidth={2.25} />}
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            endCall();
            setOpen(false);
          }}
          aria-label="Close Poll360 AI"
          className="rounded-dash p-1.5 text-dash-muted transition-colors hover:bg-dash-bg hover:text-dash-ink"
        >
          <X size={15} strokeWidth={2.25} />
        </button>
      </header>

      {notice && (
        <p className="shrink-0 border-b border-dash-line bg-amber-50 px-4 py-2 text-[0.6875rem] leading-relaxed text-amber-900">
          {notice}
        </p>
      )}

      <div ref={log} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {turns.map((turn, index) => (
          <div
            key={index}
            className={cn("flex", turn.role === "you" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-dash px-3 py-2 text-[0.8125rem] leading-relaxed",
                turn.role === "you"
                  ? "bg-dash-ink text-white"
                  : "border border-dash-line bg-dash-bg text-dash-ink"
              )}
            >
              {turn.text}
              {turn.synthetic && (
                <span className="mt-1.5 flex items-center gap-1 text-[0.625rem] font-bold uppercase tracking-wide text-amber-800">
                  Synthetic input
                </span>
              )}
            </div>
          </div>
        ))}

        {heard && (
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-dash border border-dashed border-dash-line px-3 py-2 text-[0.8125rem] italic leading-relaxed text-dash-muted">
              {heard}
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-dash-line px-4 py-2.5">
        <div className="flex flex-wrap gap-1.5">
          {suggestions.slice(0, 3).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => answer(suggestion)}
              className="rounded-full border border-dash-line px-2.5 py-1 text-[0.6875rem] font-semibold text-dash-muted transition-colors hover:bg-dash-bg hover:text-dash-ink"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          answer(typed);
          setTyped("");
        }}
        className="flex shrink-0 items-center gap-2 border-t border-dash-line p-3"
      >
        <button
          type="button"
          onClick={calling ? endCall : beginCall}
          aria-label={calling ? "End the call" : "Start a call with Poll360 AI"}
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
            calling ? "bg-brand-red text-white" : "border border-dash-line text-dash-ink hover:bg-dash-bg"
          )}
        >
          {calling ? <MicOff size={16} strokeWidth={2.25} /> : <Mic size={16} strokeWidth={2.25} />}
        </button>

        <input
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="Ask about any state, party or figure"
          aria-label="Ask Poll360 AI"
          className="min-w-0 flex-1 rounded-dash border border-dash-line bg-dash-bg px-3 py-2 text-[0.8125rem] text-dash-ink outline-none placeholder:text-dash-muted focus:border-dash-ink"
        />

        <button
          type="submit"
          disabled={!typed.trim()}
          aria-label="Send"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-dash-ink text-white transition-opacity disabled:opacity-30"
        >
          <Send size={15} strokeWidth={2.25} />
        </button>
      </form>
    </section>
  );
}
