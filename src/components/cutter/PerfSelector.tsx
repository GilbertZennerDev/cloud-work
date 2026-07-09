import { Cpu, Gauge, Rocket, Snail, Zap } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { PerfChoice, PerfState } from "@/lib/perf/usePerfTier";

interface Props {
  state: PerfState;
}

const CHOICES: { value: PerfChoice; label: string; desc: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "auto", label: "Auto", desc: "Detect hardware and pick the fastest safe path.", icon: Gauge },
  { value: "high", label: "High", desc: "For strong CPU + GPU. Max threads, no downscale, GPU face landmarks, WebCodecs audio.", icon: Rocket },
  { value: "medium", label: "Medium", desc: "Balanced defaults. WebGL landmarks, 2 ffmpeg threads.", icon: Zap },
  { value: "low", label: "Low", desc: "For weak or older machines. Ultrafast preset, 480p, single thread, CPU landmarks.", icon: Snail },
];

export function PerfSelector({ state }: Props) {
  const { choice, setChoice, report, effectiveTier, profile } = state;
  const detected = report?.tier ?? null;
  const gpuLabel = report?.caps.webgpu
    ? "WebGPU"
    : report?.caps.webgl2
      ? "WebGL2"
      : "CPU only";
  const wcLabel = report?.caps.webcodecsEncode
    ? "WebCodecs H.264"
    : report?.caps.webcodecsDecode
      ? "WebCodecs decode"
      : "no WebCodecs";
  const cores = report?.caps.cores ?? "?";

  return (
    <div>
      <div className="flex items-center gap-2">
        <Cpu className="h-4 w-4 text-muted-foreground" />
        <Label htmlFor="perf-tier">Performance mode</Label>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <Select value={choice} onValueChange={(v) => setChoice(v as PerfChoice)}>
          <SelectTrigger id="perf-tier" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHOICES.map((c) => {
              const Icon = c.icon;
              return (
                <SelectItem key={c.value} value={c.value}>
                  <span className="inline-flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5" /> {c.label}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center rounded-md border px-2 py-1 text-[11px] text-muted-foreground">
                {choice === "auto" ? `Auto → ${effectiveTier}` : `Effective: ${effectiveTier}`}
                {detected && choice === "auto" && detected !== effectiveTier ? "" : ""}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <div className="space-y-1 text-xs">
                <div><b>Detected:</b> {detected ?? "probing…"} ({cores} cores, {gpuLabel}, {wcLabel})</div>
                <div><b>ffmpeg:</b> {profile.lowPerf ? "ultrafast, 1 thread" : `veryfast, ${profile.threads} thread${profile.threads > 1 ? "s" : ""}`}, {profile.maxHeight === 0 ? "source resolution" : `${profile.maxHeight}p max`}</div>
                <div><b>Lip-sync:</b> {profile.lipsyncDelegate} delegate, {profile.lipsyncFps} fps, ±{profile.lipsyncMaxLag.toFixed(1)}s</div>
                <div><b>Audio extract:</b> {profile.webcodecsAudio ? "WebCodecs fast path" : "ffmpeg.wasm"}</div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {CHOICES.find((c) => c.value === choice)?.desc}
      </p>
    </div>
  );
}
