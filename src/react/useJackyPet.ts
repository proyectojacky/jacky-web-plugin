// useJackyPet — hook auxiliar: creates the engine and exposes the live
// controller once mounted.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { JackyEngine } from "../core/JackyEngine";
import type { JackyController } from "../core/JackyEngine";
import type { JackyPetHandle, JackyPetProps } from "./JackyPet";

export interface UseJackyPetResult {
  /** The live controller once the pet is mounted; null before mount. */
  handle: JackyPetHandle | null;
  /** Same as `handle`, as a ref object (stable identity across renders). */
  ref: RefObject<JackyPetHandle | null>;
}

export function useJackyPet(props: JackyPetProps): UseJackyPetResult {
  const optionsRef = useRef<JackyPetProps>(props);
  useEffect(() => {
    optionsRef.current = props;
  });

  const engineRef = useRef<JackyEngine | null>(null);
  const [handle, setHandle] = useState<JackyController | null>(null);

  useLayoutEffect(() => {
    const engine = new JackyEngine(optionsRef.current);
    engineRef.current = engine;
    setHandle(engine);
    return () => {
      engineRef.current = null;
      engine.destroy();
      setHandle(null);
    };
  }, []);

  useEffect(() => {
    engineRef.current?.updateConfig(optionsRef.current);
  });

  const ref: RefObject<JackyPetHandle | null> = { current: handle };
  return { ref, handle };
}
