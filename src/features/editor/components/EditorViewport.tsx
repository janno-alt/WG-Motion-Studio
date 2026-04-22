import { forwardRef, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import Moveable, { type OnDrag, type OnResize, type OnRotate } from "react-moveable";

import type { PlanItem, Preset, Theme } from "@/types";
import { SingleGraphicComposition } from "@remotion-project/compositions/SingleGraphicComposition";
import { useEditorStore } from "@/state/editorStore";

interface Props {
  theme: Theme;
  presets: Preset[];
  videoFormat: "9:16" | "1:1" | "16:9";
  onPlayerReady?: (ref: PlayerRef | null) => void;
  zoom: number;
}

const ASPECT: Record<string, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "16:9": { w: 1920, h: 1080 },
};

export const EditorViewport = forwardRef<PlayerRef, Props>(function EditorViewport(
  { theme, presets, videoFormat, onPlayerReady, zoom },
  forwardedRef,
) {
  const { w, h } = ASPECT[videoFormat] ?? ASPECT["9:16"]!;

  // Editor store → live item for Player's inputProps.
  const baseState = useEditorStore((s) => s.baseState);
  const animation = useEditorStore((s) => s.animation);
  const brief = useEditorStore((s) => s.brief);
  const tier = useEditorStore((s) => s.tier);
  const componentType = useEditorStore((s) => s.componentType);
  const styleVariant = useEditorStore((s) => s.styleVariant);
  const durationSec = useEditorStore((s) => s.duration);
  const itemId = useEditorStore((s) => s.itemId);
  const setPosition = useEditorStore((s) => s.setPosition);
  const setScale = useEditorStore((s) => s.setScale);
  const setRotation = useEditorStore((s) => s.setRotation);

  const playerLocalRef = useRef<PlayerRef | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [safeAreas, setSafeAreas] = useState(true);

  // Track the displayed size of the player so we can translate overlay coords.
  const [displayed, setDisplayed] = useState({ w: 0, h: 0 });

  const presetMap = useMemo(() => {
    const m: Record<string, Preset> = {};
    for (const p of presets) m[p.id] = p;
    return m;
  }, [presets]);

  const liveItem: PlanItem | null = useMemo(() => {
    if (!itemId) return null;
    return {
      id: itemId,
      timestamp: 0,
      duration: durationSec,
      tier,
      componentType,
      brief,
      srtContext: "",
      status: "proposed",
      baseState,
      animation,
      styleVariant,
    };
  }, [itemId, durationSec, tier, componentType, brief, baseState, animation, styleVariant]);

  const inputProps = useMemo(
    () => ({ item: liveItem ?? placeholder(), theme, presets: presetMap }),
    [liveItem, theme, presetMap],
  );

  // Observe the player's rendered dimensions so Moveable can live above it.
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setDisplayed({ w: rect.width, h: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Register player ref upstream for transport controls.
  const attachPlayerRef = (r: PlayerRef | null) => {
    playerLocalRef.current = r;
    if (typeof forwardedRef === "function") forwardedRef(r);
    else if (forwardedRef) forwardedRef.current = r;
    onPlayerReady?.(r);
  };

  // Viewport → composition coords.
  const scaleX = displayed.w / w;
  const scaleY = displayed.h / h;

  /* ----- Overlay transform (what Moveable sees) ----- */

  // Draw a box centered on baseState.position using a fixed "unit" size so the
  // handles don't collapse to zero while allowing scaling.
  const UNIT = 240;
  const overlayWidth = UNIT * baseState.scale.x;
  const overlayHeight = UNIT * baseState.scale.y;
  const overlayLeft = baseState.position.x * scaleX - (overlayWidth * scaleX) / 2;
  const overlayTop = baseState.position.y * scaleY - (overlayHeight * scaleY) / 2;

  /* ----- Moveable handlers ----- */

  const [dragLabel, setDragLabel] = useState<string | null>(null);

  const onDrag = ({ beforeTranslate }: OnDrag) => {
    // `beforeTranslate` is in displayed pixels. Convert back to composition coords.
    const dx = beforeTranslate[0] ?? 0;
    const dy = beforeTranslate[1] ?? 0;
    const nx = baseState.position.x + dx / scaleX;
    const ny = baseState.position.y + dy / scaleY;
    setPosition(Math.round(nx), Math.round(ny));
    setDragLabel(`X ${Math.round(nx)} · Y ${Math.round(ny)}`);
  };

  const onRotate = ({ beforeRotate }: OnRotate) => {
    setRotation(Math.round(beforeRotate));
    setDragLabel(`${Math.round(beforeRotate)}°`);
  };

  const onResize = ({ width, height }: OnResize) => {
    const sx = width / (UNIT * scaleX);
    const sy = height / (UNIT * scaleY);
    setScale(Number(sx.toFixed(3)), Number(sy.toFixed(3)));
    setDragLabel(`S ${sx.toFixed(2)}x`);
  };

  const clearLabel = () => setDragLabel(null);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-0">
      <div
        className="flex flex-1 items-center justify-center overflow-auto p-6"
        style={{
          backgroundImage:
            zoom < 0.25
              ? "none"
              : "linear-gradient(45deg, #14141455 25%, transparent 25%), linear-gradient(-45deg, #14141455 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #14141455 75%), linear-gradient(-45deg, transparent 75%, #14141455 75%)",
          backgroundSize: "16px 16px",
          backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
        }}
      >
        <div
          className="relative shrink-0 rounded-card border border-border-subtle shadow-panel"
          style={{
            width: w * zoom,
            height: h * zoom,
            aspectRatio: `${w}/${h}`,
          }}
        >
          <div ref={frameRef} className="absolute inset-0 overflow-hidden rounded-card">
            <Player
              ref={attachPlayerRef}
              component={SingleGraphicComposition}
              compositionWidth={w}
              compositionHeight={h}
              durationInFrames={Math.max(30, Math.round(durationSec * 30))}
              fps={30}
              inputProps={inputProps}
              controls={false}
              style={{ width: "100%", height: "100%", background: theme.colors.background }}
              loop
              clickToPlay={false}
            />

            {/* Safe-area overlay */}
            {safeAreas ? (
              <>
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-[5%] rounded-[4px] border border-dashed border-text-muted/40"
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-[10%] rounded-[2px] border border-dashed border-text-muted/30"
                />
              </>
            ) : null}
          </div>

          {/* Moveable overlay — sibling div positioned over the player */}
          <div
            ref={overlayRef}
            className="absolute cursor-move border border-dashed border-accent-primary/60 bg-accent-primary/5"
            style={{
              left: overlayLeft,
              top: overlayTop,
              width: overlayWidth * scaleX,
              height: overlayHeight * scaleY,
              transform: `rotate(${baseState.rotation}deg)`,
              transformOrigin: "center center",
            }}
          />

          <Moveable
            target={overlayRef.current}
            draggable
            resizable
            rotatable
            origin
            keepRatio={false}
            throttleDrag={1}
            throttleResize={1}
            throttleRotate={1}
            onDrag={onDrag}
            onRotate={onRotate}
            onResize={onResize}
            onDragEnd={clearLabel}
            onRotateEnd={clearLabel}
            onResizeEnd={clearLabel}
            snappable
            snapThreshold={8}
            verticalGuidelines={[0, displayed.w / 2, displayed.w]}
            horizontalGuidelines={[0, displayed.h / 2, displayed.h]}
          />

          {dragLabel ? (
            <div className="pointer-events-none absolute -top-6 left-0 rounded-default bg-surface-3 px-2 py-0.5 font-mono text-2xs text-text-primary shadow-panel">
              {dragLabel}
            </div>
          ) : null}
        </div>
      </div>

      {/* Viewport footer — zoom + toggles */}
      <div className="flex h-8 shrink-0 items-center justify-end gap-2 border-t border-border-subtle bg-surface-1 px-3 text-2xs text-text-muted">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={safeAreas}
            onChange={(e) => setSafeAreas(e.target.checked)}
            className="accent-accent-primary"
          />
          Safe areas
        </label>
        <span className="font-mono">{Math.round(zoom * 100)}%</span>
      </div>
    </div>
  );
});

function placeholder(): PlanItem {
  return {
    id: "__placeholder",
    timestamp: 0,
    duration: 2,
    tier: 1,
    componentType: "IconPopIn",
    brief: "",
    srtContext: "",
    status: "proposed",
    baseState: {
      position: { x: 540, y: 960 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      opacity: 1,
      anchorPoint: { x: 0.5, y: 0.5 },
    },
    animation: {
      enter: { motion: null, mask: null },
      idle: { motion: [], mask: null },
      exit: { motion: null, mask: null },
    },
  };
}
