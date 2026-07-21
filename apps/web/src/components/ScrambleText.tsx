import { useEffect, useRef, useState } from "react";

const GLYPHS = "01ABCDEFGHIJKLMNOPQRSTUVWXYZ#%&*";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Resolves each character from noise into the target text, left to right —
 * a nod to what the tool itself does to a ROM's data. Runs once on mount,
 * skips straight to final text under prefers-reduced-motion.
 */
export function ScrambleText({ text, className }: { text: string; className?: string }) {
  const [display, setDisplay] = useState(prefersReducedMotion() ? text : "");
  const frame = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(text);
      return;
    }
    let raf: number;
    const totalFrames = 24;

    const tick = () => {
      frame.current += 1;
      const revealCount = Math.floor((frame.current / totalFrames) * text.length);
      let next = "";
      for (let i = 0; i < text.length; i++) {
        if (text[i] === " ") {
          next += " ";
        } else if (i < revealCount) {
          next += text[i];
        } else {
          next += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        }
      }
      setDisplay(next);
      if (frame.current < totalFrames) {
        raf = requestAnimationFrame(tick);
      } else {
        setDisplay(text);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text]);

  return (
    <span className={className} aria-label={text}>
      {display}
    </span>
  );
}
