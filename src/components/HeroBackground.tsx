"use client";

import { useEffect, useRef, useState } from "react";

const CUSTOM_VIDEO_URL = process.env.NEXT_PUBLIC_HERO_VIDEO_URL?.trim() || "";
/** Baku harbor clip, served from public/media (H.264, fast-start). */
const VIDEO_URL = CUSTOM_VIDEO_URL || "/media/hero-harbor.mp4";
/** The poster is the clip's exact first frame, so the swap from image to video does not jump. */
const POSTER = CUSTOM_VIDEO_URL ? "/media/hero-harbor.webp" : "/media/hero-harbor-poster.jpg";

/**
 * Seconds of crossfade between the end of one pass and the start of the next.
 * The clip is a forward camera move, so its last and first frames differ a lot;
 * a hard cut back to frame 0 is visible. Two stacked copies dissolve instead.
 */
const FADE_S = 1.2;
/** Start the fade this much before the fade needs to finish, to absorb play() latency. */
const LEAD_S = 0.15;

/**
 * Cinematic hero background.
 * - Muted, inline, autoplaying video that covers the hero, with a poster while it loads.
 * - Loops by crossfading two copies of the same clip (the `loop` attribute is a no-script safety net).
 * - prefers-reduced-motion: the static poster only, no video.
 * - If the video fails to load, or autoplay is blocked, the poster stays visible.
 */
export function HeroBackground() {
  const [reduceMotion, setReduceMotion] = useState(true);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const showVideo = !reduceMotion && !videoFailed;

  return (
    <div className="hero-bg" aria-hidden="true">
      {showVideo ? (
        <CrossfadeLoop src={VIDEO_URL} poster={POSTER} onFail={() => setVideoFailed(true)} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- decorative, fixed-size asset
        <img className="hero-bg__media" src={POSTER} alt="" fetchPriority="high" decoding="async" />
      )}
      <div className="hero-bg__overlay" />
    </div>
  );
}

function CrossfadeLoop({ src, poster, onFail }: { src: string; poster: string; onFail: () => void }) {
  const first = useRef<HTMLVideoElement>(null);
  const second = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const videos = [first.current, second.current];
    if (!videos[0] || !videos[1]) return;
    const [a, b] = videos as [HTMLVideoElement, HTMLVideoElement];
    for (const v of [a, b]) {
      v.muted = true; // property, not just the attribute: required for autoplay everywhere
      v.defaultMuted = true;
      // The markup keeps `loop` so the clip still loops if this script never runs.
      // Once it runs, it owns the loop point: a native wrap-around would be a hard cut.
      v.loop = false;
    }

    let front = a;
    let back = b;
    let fading = false;
    let inView = true;
    let raf = 0;

    const play = (v: HTMLVideoElement) => v.play().catch(() => { /* autoplay blocked: poster stays */ });
    const smooth = (p: number) => p * p * (3 - 2 * p);

    const tick = () => {
      raf = requestAnimationFrame(tick);
      step();
    };

    // Runs on every animation frame and on every `timeupdate`, so the fade
    // still completes when animation frames are throttled (low-power mode,
    // unfocused windows).
    const step = () => {
      if (!fading) {
        const d = front.duration;
        if (!inView || !Number.isFinite(d) || d <= FADE_S * 2) return;
        if (front.currentTime < d - FADE_S - LEAD_S) return;
        // Bring the next pass in on top, from its first frame.
        fading = true;
        back.currentTime = 0;
        back.style.opacity = "0";
        back.style.zIndex = "1";
        front.style.zIndex = "0";
        play(back);
        return;
      }
      // The fade follows the incoming clip's own playback time, so it cannot
      // run ahead of (or behind) the video, and the outgoing clip is only
      // removed once the incoming one fully covers it.
      const incoming = back;
      const progress = Math.min(1, incoming.currentTime / FADE_S);
      incoming.style.opacity = String(smooth(progress));
      if (progress >= 1) {
        front.pause();
        front.style.opacity = "0";
        back = front;
        front = incoming;
        fading = false;
      }
    };

    // Without animation frames (background tab) the crossfade cannot run;
    // restart from the first frame so playback never stops at the end.
    const onEnded = (e: Event) => {
      const v = e.currentTarget as HTMLVideoElement;
      if (v === front && !fading) {
        v.currentTime = 0;
        play(v);
      }
    };
    for (const v of [a, b]) {
      v.addEventListener("ended", onEnded);
      v.addEventListener("timeupdate", step);
    }

    // Pause while the hero is off-screen; resume when it is back.
    const io = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      if (inView) play(front);
      else if (!fading) front.pause();
    });
    io.observe(a);

    // Browsers pause silent videos in hidden tabs; resume when the tab is shown again.
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !inView) return;
      play(front);
      if (fading) play(back);
    };
    document.addEventListener("visibilitychange", onVisible);

    a.style.opacity = "1";
    a.style.zIndex = "1";
    b.style.opacity = "0";
    play(a);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      for (const v of [a, b]) {
        v.removeEventListener("ended", onEnded);
        v.removeEventListener("timeupdate", step);
      }
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const common = {
    className: "hero-bg__media hero-bg__video",
    src,
    poster,
    muted: true,
    loop: true,
    playsInline: true,
    disablePictureInPicture: true,
    disableRemotePlayback: true,
    onError: onFail,
  } as const;

  return (
    <>
      <video ref={first} {...common} autoPlay preload="auto" />
      <video ref={second} {...common} preload="auto" />
    </>
  );
}
