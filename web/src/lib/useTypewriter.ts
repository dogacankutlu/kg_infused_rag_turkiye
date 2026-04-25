import { useEffect, useState } from "react";

type Opts = {
  typeMs?: number;   // ms between typed chars
  eraseMs?: number;  // ms between erased chars
  holdMs?: number;   // ms to hold the full phrase before erasing
  gapMs?: number;    // ms between phrases
};

/**
 * Cycle through `phrases`, typing letter-by-letter, pausing, erasing,
 * then moving to the next. Returns the current substring suitable for
 * use as an <input> placeholder.
 */
export function useTypewriter(
  phrases: string[],
  { typeMs = 55, eraseMs = 30, holdMs = 1500, gapMs = 350 }: Opts = {}
): string {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"type" | "hold" | "erase" | "gap">("type");
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!phrases.length) return;
    const phrase = phrases[idx % phrases.length];
    let t: ReturnType<typeof setTimeout>;

    if (phase === "type") {
      if (text.length < phrase.length) {
        t = setTimeout(() => setText(phrase.slice(0, text.length + 1)), typeMs);
      } else {
        t = setTimeout(() => setPhase("hold"), 0);
      }
    } else if (phase === "hold") {
      t = setTimeout(() => setPhase("erase"), holdMs);
    } else if (phase === "erase") {
      if (text.length > 0) {
        t = setTimeout(() => setText(text.slice(0, -1)), eraseMs);
      } else {
        t = setTimeout(() => setPhase("gap"), 0);
      }
    } else {
      // gap
      t = setTimeout(() => {
        setIdx((i) => (i + 1) % phrases.length);
        setPhase("type");
      }, gapMs);
    }

    return () => clearTimeout(t);
  }, [text, phase, idx, phrases, typeMs, eraseMs, holdMs, gapMs]);

  return text;
}
