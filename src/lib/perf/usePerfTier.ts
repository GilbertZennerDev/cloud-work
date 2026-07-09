import { useEffect, useState } from "react";
import { detectPerf, profileFor, type PerfReport, type PerfTier, type TierProfile } from "./detect";

const STORAGE_KEY = "luxstream:perfTier";

export type PerfChoice = "auto" | PerfTier;

export interface PerfState {
  choice: PerfChoice;
  setChoice: (c: PerfChoice) => void;
  report: PerfReport | null;
  effectiveTier: PerfTier;
  profile: TierProfile;
}

const DEFAULT_PROFILE = profileFor("medium", {
  cores: 4,
  memoryGb: null,
  crossOriginIsolated: false,
  sharedArrayBuffer: false,
  webgl2: false,
  webgpu: false,
  webcodecsDecode: false,
  webcodecsEncode: false,
  gpuVendor: null,
  gpuArchitecture: null,
  isMobile: false,
});

function readStored(): PerfChoice {
  if (typeof localStorage === "undefined") return "auto";
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "low" || v === "medium" || v === "high" || v === "auto") return v;
  return "auto";
}

export function usePerfTier(): PerfState {
  const [choice, setChoiceState] = useState<PerfChoice>(() => readStored());
  const [report, setReport] = useState<PerfReport | null>(null);

  useEffect(() => {
    let cancelled = false;
    detectPerf().then((r) => {
      if (!cancelled) setReport(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setChoice = (c: PerfChoice) => {
    setChoiceState(c);
    try {
      localStorage.setItem(STORAGE_KEY, c);
    } catch {
      // ignore quota / disabled storage
    }
  };

  const effectiveTier: PerfTier =
    choice === "auto" ? (report?.tier ?? "medium") : choice;
  const profile = report ? profileFor(effectiveTier, report.caps) : DEFAULT_PROFILE;

  return { choice, setChoice, report, effectiveTier, profile };
}
