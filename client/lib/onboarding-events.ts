let _triggerReplay: (() => void) | null = null;

export function registerOnboardingReplayTrigger(fn: () => void): () => void {
  _triggerReplay = fn;
  return () => { _triggerReplay = null; };
}

export function triggerOnboardingReplay(): void {
  _triggerReplay?.();
}
