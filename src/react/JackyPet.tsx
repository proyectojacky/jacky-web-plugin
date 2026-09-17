// <JackyPet /> — thin React wrapper around JackyEngine (plan §2.1).
// The engine creates and owns its own DOM (appended to <body>), so the
// component renders null. An imperative handle exposes the controller.

import React, {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";
import { JackyEngine } from "../core/JackyEngine";
import type { JackyController, JackyOptions } from "../core/JackyEngine";
import type { WalkMode, ChatMode } from "../core/types";
import type {
  SkinSourceConfig,
  SkinMetadata,
} from "../skin/skinLoader";
import type { PetState } from "../animation/petState";

export type JackyPetHandle = JackyController;

export interface JackyPetProps {
  speed?: number;
  walkMode?: WalkMode;
  draggable?: boolean;
  bounds?: JackyOptions["bounds"];
  size?: number;
  scale?: number;
  zIndex?: number;
  initialPosition?: JackyOptions["initialPosition"];
  dialogues?: string[] | JackyOptions["dialogues"];
  chatMode?: ChatMode;
  chatInterval?: [number, number];
  bubbleDuration?: number;
  skin?: string | SkinSourceConfig | File | Blob;
  allowDropSkin?: boolean;
  skinPersistence?: "none" | "visitor";
  skinScope?: string;
  fps?: number;
  workshopApiBase?: string;
  onClick?: (pet: JackyController, event: MouseEvent) => void;
  onStateChange?: (newState: PetState, oldState: PetState) => void;
  onSkinLoaded?: (skinInfo: SkinMetadata) => void;
  onError?: (error: unknown) => void;
  /** Called once after the engine mounts, with the live controller. */
  onReady?: (pet: JackyPetHandle) => void;
}

function toEngineOptions(props: JackyPetProps): JackyOptions {
  return {
    speed: props.speed,
    walkMode: props.walkMode,
    draggable: props.draggable,
    bounds: props.bounds,
    size: props.size,
    scale: props.scale,
    zIndex: props.zIndex,
    initialPosition: props.initialPosition,
    dialogues: props.dialogues,
    chatMode: props.chatMode,
    chatInterval: props.chatInterval,
    bubbleDuration: props.bubbleDuration,
    skin: props.skin,
    allowDropSkin: props.allowDropSkin,
    skinPersistence: props.skinPersistence,
    skinScope: props.skinScope,
    fps: props.fps,
    workshopApiBase: props.workshopApiBase,
    onClick: props.onClick,
    onStateChange: props.onStateChange,
    onSkinLoaded: props.onSkinLoaded,
    onError: props.onError,
  };
}

export const JackyPet = React.forwardRef<JackyPetHandle, JackyPetProps>(
  function JackyPet(props, ref) {
    const engineRef = useRef<JackyEngine | null>(null);
    const optionsRef = useRef<JackyPetProps>(props);
    const onReadyRef = useRef<JackyPetProps["onReady"]>(props.onReady);

    // Keep latest props/callbacks without re-creating the engine.
    useEffect(() => {
      optionsRef.current = props;
      onReadyRef.current = props.onReady;
    });

    // Create/destroy once; the engine manages its own DOM lifecycle.
    useLayoutEffect(() => {
      const engine = new JackyEngine(optionsRef.current);
      engineRef.current = engine;
      onReadyRef.current?.(engine);
      return () => {
        engineRef.current = null;
        engine.destroy();
      };
    }, []);

    // Apply prop updates without remounting.
    useEffect(() => {
      engineRef.current?.updateConfig(toEngineOptions(props));
    });

    useImperativeHandle(ref, () => engineRef.current as JackyPetHandle, []);

    return null;
  },
);

JackyPet.displayName = "JackyPet";
