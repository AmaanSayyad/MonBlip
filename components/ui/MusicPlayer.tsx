"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  ListMusic,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  DEFAULT_TRACK_ID,
  MUSIC_PLAYLIST,
  type MusicTrack,
} from "@/lib/music-playlist";
import { readStored, writeStored } from "@/lib/brand/browserStore";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const STORAGE_KEY = "monblip.music";

/** Survives React remounts on the landing page only. */
let sharedAudio: HTMLAudioElement | null = null;

function getSharedAudio(): HTMLAudioElement {
  if (sharedAudio) return sharedAudio;
  const audio = new Audio();
  audio.preload = "auto";
  audio.autoplay = false;
  audio.loop = false;
  audio.setAttribute("playsinline", "");
  audio.setAttribute("webkit-playsinline", "true");
  sharedAudio = audio;
  return audio;
}

/** Hard-stop for non-landing routes (guard + player unmount). */
export function stopSharedMusic() {
  const audio = sharedAudio;
  if (!audio) return;
  try {
    audio.pause();
    audio.currentTime = 0;
    audio.autoplay = false;
    audio.removeAttribute("autoplay");
    audio.src = "";
    audio.load();
  } catch {
    /* ignore */
  }
}

type Persisted = {
  muted?: boolean;
  volume?: number;
  collapsed?: boolean;
  x?: number;
  y?: number;
};

function defaultTrackIndex(): number {
  const i = MUSIC_PLAYLIST.findIndex((t) => t.id === DEFAULT_TRACK_ID);
  return i >= 0 ? i : 0;
}

function readPersisted(): Persisted {
  try {
    const raw = readStored(STORAGE_KEY, ["bynomo.music"]);
    return raw ? (JSON.parse(raw) as Persisted) : {};
  } catch {
    return {};
  }
}

function writePersisted(patch: Persisted) {
  try {
    const next = { ...readPersisted(), ...patch };
    delete (next as Persisted & { trackIndex?: number; disabled?: boolean }).trackIndex;
    delete (next as Persisted & { disabled?: boolean }).disabled;
    delete (next as { muted?: boolean }).muted;
    writeStored(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function clampPos(x: number, y: number, w: number, h: number) {
  const maxX = Math.max(8, window.innerWidth - w - 8);
  const maxY = Math.max(8, window.innerHeight - h - 8);
  return {
    x: Math.min(maxX, Math.max(8, x)),
    y: Math.min(maxY, Math.max(8, y)),
  };
}

export function MusicPlayer() {
  const pathname = usePathname();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    ox: number;
    oy: number;
    sx: number;
    sy: number;
    moved: boolean;
  } | null>(null);

  const [mounted, setMounted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.55);
  const [trackIndex, setTrackIndex] = useState(defaultTrackIndex);
  const [progress, setProgress] = useState(0);
  const [collapsed, setCollapsed] = useState(true);
  const [showList, setShowList] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [pos, setPos] = useState({ x: 20, y: 0 });
  const [dragging, setDragging] = useState(false);
  const startedRef = useRef(false);
  const autoplayMutedRef = useRef(true);
  const trackIndexRef = useRef(defaultTrackIndex());

  const track: MusicTrack = MUSIC_PLAYLIST[trackIndex] ?? MUSIC_PLAYLIST[0]!;

  const ensureAudio = useCallback(() => {
    const audio = getSharedAudio();
    audioRef.current = audio;
    return audio;
  }, []);

  const loadTrack = useCallback(
    (index: number) => {
      const audio = ensureAudio();
      const next =
        ((index % MUSIC_PLAYLIST.length) + MUSIC_PLAYLIST.length) %
        MUSIC_PLAYLIST.length;
      trackIndexRef.current = next;
      setTrackIndex(next);
      const t = MUSIC_PLAYLIST[next]!;
      if (!audio.src.endsWith(t.src) && !audio.src.includes(encodeURI(t.src))) {
        audio.src = t.src;
      }
      audio.load();
    },
    [ensureAudio]
  );

  const stopEverywhere = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setPlaying(false);
    setDisabled(true);
    setNeedsGesture(false);
  }, []);

  const unmuteAndPlay = useCallback((vol: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = false;
    audio.volume = vol;
    void audio.play().then(
      () => {
        autoplayMutedRef.current = false;
        startedRef.current = true;
        setMuted(false);
        setNeedsGesture(false);
        setPlaying(true);
      },
      () => {
        // Keep muted playback going if unmute is blocked
        audio.muted = true;
        void audio.play().then(
          () => {
            startedRef.current = true;
            autoplayMutedRef.current = true;
            setPlaying(true);
            setNeedsGesture(true);
          },
          () => setNeedsGesture(true)
        );
      }
    );
  }, []);

  const startPlayback = useCallback(
    async (opts?: { force?: boolean; unmute?: boolean }) => {
      const audio = ensureAudio();
      try {
        if (!audio.src) {
          loadTrack(trackIndexRef.current);
        }
        const vol = volume;
        const wantSound = opts?.unmute || !autoplayMutedRef.current;
        audio.muted = !wantSound;
        audio.volume = vol;
        await audio.play();
        startedRef.current = true;
        setNeedsGesture(false);
        setPlaying(true);
        setDisabled(false);
        if (wantSound) {
          autoplayMutedRef.current = false;
          setMuted(false);
        }
      } catch {
        setNeedsGesture(true);
        setPlaying(false);
      }
    },
    [ensureAudio, loadTrack, volume]
  );

  useEffect(() => {
    setMounted(true);
    const audio = ensureAudio();
    const saved = readPersisted();
    writePersisted({ muted: false });

    const vol = typeof saved.volume === "number" ? saved.volume : 0.55;
    setVolume(vol);
    audio.volume = vol;
    audio.muted = false;
    setMuted(false);
    if (typeof saved.collapsed === "boolean") {
      setCollapsed(saved.collapsed);
    } else if (window.innerWidth >= 768) {
      setCollapsed(false);
    }

    const idx = defaultTrackIndex();
    trackIndexRef.current = idx;
    setTrackIndex(idx);
    const desiredSrc = MUSIC_PLAYLIST[idx]!.src;
    if (!audio.src.includes(desiredSrc) && !audio.src.endsWith(desiredSrc)) {
      audio.src = desiredSrc;
    }

    const narrow = window.innerWidth < 768;
    const defaultY = Math.max(8, window.innerHeight - (narrow ? 72 : 180));
    const nextPos = clampPos(
      narrow ? Math.max(8, window.innerWidth - 68) : (typeof saved.x === "number" ? saved.x : 20),
      narrow ? defaultY : (typeof saved.y === "number" ? saved.y : defaultY),
      narrow ? 56 : 300,
      narrow ? 56 : 160
    );
    setPos(nextPos);

    const onTime = () => {
      if (!audio.duration || !Number.isFinite(audio.duration)) {
        setProgress(0);
        return;
      }
      setProgress(audio.currentTime / audio.duration);
    };
    const onEnded = () => {
      const next = (trackIndexRef.current + 1) % MUSIC_PLAYLIST.length;
      loadTrack(next);
      audio.muted = autoplayMutedRef.current;
      void audio.play().then(
        () => setPlaying(true),
        () => setPlaying(false)
      );
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    const startAutoplay = async () => {
      audio.volume = vol;
      audio.muted = false;
      try {
        await audio.play();
        startedRef.current = true;
        autoplayMutedRef.current = false;
        setPlaying(true);
        setMuted(false);
        setNeedsGesture(false);
        return;
      } catch {
        /* browser blocked sound - fall through to muted */
      }

      audio.muted = true;
      try {
        await audio.play();
        startedRef.current = true;
        autoplayMutedRef.current = true;
        setPlaying(true);
        setNeedsGesture(true);
        window.setTimeout(() => unmuteAndPlay(vol), 50);
        window.setTimeout(() => unmuteAndPlay(vol), 400);
        window.setTimeout(() => unmuteAndPlay(vol), 1200);
      } catch {
        setNeedsGesture(true);
      }
    };

    void startAutoplay();
    const canplay = () => {
      if (!startedRef.current) void startAutoplay();
    };
    audio.addEventListener("canplay", canplay);

    const unlock = () => {
      if (autoplayMutedRef.current) {
        unmuteAndPlay(vol);
        return;
      }
      if (!startedRef.current) {
        void startPlayback({ force: true, unmute: true });
      }
    };

    const opts = { capture: true, passive: true } as const;
    const events = [
      "pointerdown",
      "pointermove",
      "mousemove",
      "click",
      "keydown",
      "touchstart",
      "touchmove",
      "wheel",
      "scroll",
      "focus",
    ] as const;
    for (const ev of events) window.addEventListener(ev, unlock, opts);

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!startedRef.current) void startAutoplay();
      else if (autoplayMutedRef.current) unmuteAndPlay(vol);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("canplay", canplay);
      for (const ev of events) window.removeEventListener(ev, unlock, opts);
      document.removeEventListener("visibilitychange", onVisible);
      // Leaving the landing page - never keep playing in /app or elsewhere
      stopSharedMusic();
      setPlaying(false);
      startedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (window.innerWidth >= 768) return;
    const onTrade = pathname === "/trade" || pathname.startsWith("/trade/");
    const y = onTrade ? 68 : Math.max(8, window.innerHeight - 64);
    const x = Math.max(8, window.innerWidth - 76);
    setPos(clampPos(x, y, 52, 48));
  }, [pathname]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      d.moved = true;
      const el = panelRef.current;
      const w = el?.offsetWidth ?? 300;
      const h = el?.offsetHeight ?? 160;
      const next = clampPos(d.sx + (e.clientX - d.ox), d.sy + (e.clientY - d.oy), w, h);
      setPos(next);
    };
    const onUp = () => {
      if (!dragRef.current) return;
      const el = panelRef.current;
      const w = el?.offsetWidth ?? 300;
      const h = el?.offsetHeight ?? 160;
      setPos((p) => {
        const next = clampPos(p.x, p.y, w, h);
        writePersisted({ x: next.x, y: next.y });
        return next;
      });
      dragRef.current = null;
      setDragging(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  if (!mounted || disabled) {
    if (mounted && disabled) {
      return (
        <button
          type="button"
          onClick={() => {
            setDisabled(false);
            void startPlayback({ force: true, unmute: true });
          }}
          className="fixed bottom-4 left-4 z-[60] rounded-full border border-white/15 bg-black/80 px-3 py-1.5 text-[11px] text-rh-muted backdrop-blur hover:border-rh-lime/40 hover:text-rh-lime"
        >
          Music
        </button>
      );
    }
    return null;
  }

  const bars = Array.from({ length: 16 }, (_, i) => i);
  const activeBar = Math.min(15, Math.floor(progress * 16));

  return (
    <div
      ref={panelRef}
      className={`fixed z-[60] flex max-w-[calc(100vw-1rem)] flex-col items-start gap-2 ${pathname === "/trade" ? "max-sm:hidden" : ""}`}
      style={{ left: pos.x, top: pos.y, touchAction: "none" }}
    >
      {needsGesture && playing && (
        <button
          type="button"
          onClick={() => {
            autoplayMutedRef.current = false;
            void startPlayback({ force: true, unmute: true });
          }}
          className="rounded-full border border-rh-lime/40 bg-rh-lime/90 px-3 py-1.5 text-[11px] font-semibold text-rh-on-lime shadow-[0_0_20px_-6px_rgba(204,255,0,0.6)]"
        >
          Tap for sound
        </button>
      )}

      {needsGesture && !playing && (
        <button
          type="button"
          onClick={() => void startPlayback({ force: true })}
          className="animate-pulse rounded-full border border-rh-lime/40 bg-rh-lime px-4 py-2 text-xs font-semibold text-rh-on-lime shadow-[0_0_28px_-6px_rgba(204,255,0,0.7)]"
        >
          Tap for music
        </button>
      )}

      <div
        className={cn(
          "kit-dark overflow-hidden rounded-2xl border border-white/10 bg-black/95 shadow-[0_20px_50px_-24px_rgba(0,0,0,0.9)] backdrop-blur-md",
          collapsed ? "w-[220px] max-sm:w-auto" : "w-[min(100%,300px)]",
          dragging && "cursor-grabbing ring-1 ring-rh-lime/40"
        )}
      >
        <div
          className="flex cursor-grab items-center gap-1.5 px-2 py-2.5 active:cursor-grabbing"
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest("button, input, a")) return;
            dragRef.current = {
              ox: e.clientX,
              oy: e.clientY,
              sx: pos.x,
              sy: pos.y,
              moved: false,
            };
            setDragging(true);
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          }}
        >
          <GripVertical className="hidden h-4 w-4 shrink-0 text-rh-dim sm:block" aria-hidden />

          <button
            type="button"
            aria-label={playing ? "Pause" : "Play"}
            onClick={() => {
              const audio = ensureAudio();
              if (playing) {
                audio.pause();
                setPlaying(false);
              } else {
                void startPlayback({ force: true });
              }
            }}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rh-lime text-rh-on-lime transition-transform hover:scale-105"
          >
            {playing ? (
              <Pause className="h-4 w-4" fill="currentColor" />
            ) : (
              <Play className="h-4 w-4" fill="currentColor" />
            )}
          </button>

          <div className="hidden min-w-0 flex-1 select-none sm:block">
            <p className="truncate text-[12px] font-medium text-white">
              {track.title}
              {track.spatial ? (
                <span className="ml-1 text-[10px] text-rh-lime">{track.spatial}</span>
              ) : null}
            </p>
            {!collapsed && (
              <p className="truncate text-[10px] text-rh-muted">
                {track.artist} · {track.bpm} BPM · drag to move
              </p>
            )}
          </div>

          <button
            type="button"
            aria-label={collapsed ? "Expand player" : "Collapse player"}
            onClick={() => {
              setCollapsed((v) => {
                writePersisted({ collapsed: !v });
                return !v;
              });
            }}
            className="rounded-lg p-1.5 text-rh-muted hover:bg-white/5 hover:text-white"
          >
            {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          <button
            type="button"
            aria-label="Stop and hide player"
            onClick={stopEverywhere}
            className="rounded-lg p-1.5 text-rh-muted hover:bg-white/5 hover:text-red-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!collapsed && (
          <>
            <div className="flex h-6 items-end gap-0.5 px-3 pb-1">
              {bars.map((i) => (
                <span
                  key={i}
                  className="flex-1 rounded-sm transition-all duration-100"
                  style={{
                    height:
                      playing && i === activeBar
                        ? "100%"
                        : playing && Math.abs(i - activeBar) < 3
                          ? "55%"
                          : "22%",
                    background: i === activeBar ? track.color : "rgba(255,255,255,0.12)",
                    opacity: playing ? 1 : 0.45,
                  }}
                />
              ))}
            </div>

            <div className="flex items-center justify-between gap-1 px-2 pb-2.5">
              <button
                type="button"
                aria-label="Previous track"
                onClick={() => {
                  const next =
                    (trackIndexRef.current - 1 + MUSIC_PLAYLIST.length) %
                    MUSIC_PLAYLIST.length;
                  loadTrack(next);
                  void startPlayback({ force: true });
                }}
                className="rounded-lg p-2 text-rh-muted hover:bg-white/5 hover:text-white"
              >
                <SkipBack className="h-4 w-4" />
              </button>

              <button
                type="button"
                aria-label="Playlist"
                onClick={() => setShowList((v) => !v)}
                className={cn(
                  "rounded-lg p-2 hover:bg-white/5",
                  showList ? "text-rh-lime" : "text-rh-muted hover:text-white"
                )}
              >
                <ListMusic className="h-4 w-4" />
              </button>

              <button
                type="button"
                aria-label={muted ? "Unmute" : "Mute"}
                onClick={() => {
                  const audio = ensureAudio();
                  const next = !muted;
                  audio.muted = next;
                  if (!next) {
                    autoplayMutedRef.current = false;
                    audio.volume = volume;
                  }
                  setMuted(next);
                  writePersisted({ muted: next });
                }}
                className="rounded-lg p-2 text-rh-muted hover:bg-white/5 hover:text-white"
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>

              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                aria-label="Volume"
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setVolume(v);
                  const audio = ensureAudio();
                  audio.volume = muted ? 0 : v;
                  writePersisted({ volume: v });
                  if (v > 0 && muted) {
                    audio.muted = false;
                    setMuted(false);
                    writePersisted({ muted: false });
                  }
                }}
                className="mx-1 h-1 w-16 cursor-pointer accent-[#7005FC]"
              />

              <button
                type="button"
                aria-label="Next track"
                onClick={() => {
                  const next = (trackIndexRef.current + 1) % MUSIC_PLAYLIST.length;
                  loadTrack(next);
                  void startPlayback({ force: true });
                }}
                className="rounded-lg p-2 text-rh-muted hover:bg-white/5 hover:text-white"
              >
                <SkipForward className="h-4 w-4" />
              </button>
            </div>

            {showList && (
              <ul className="max-h-44 overflow-y-auto border-t border-white/[0.06] py-1">
                {MUSIC_PLAYLIST.map((t, i) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => {
                        loadTrack(i);
                        setShowList(false);
                        void startPlayback({ force: true });
                      }}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] transition-colors hover:bg-white/[0.04]",
                        i === trackIndex ? "text-rh-lime" : "text-white/85"
                      )}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: t.color }}
                      />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {t.title}
                      </span>
                      {t.spatial ? (
                        <span className="text-[10px] text-rh-lime">{t.spatial}</span>
                      ) : (
                        <span className="tabular-nums text-[10px] text-rh-dim">{t.bpm}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
