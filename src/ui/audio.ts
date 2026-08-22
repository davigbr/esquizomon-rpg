/** Synthesized sound effects with the Web Audio API — zero files, works
 *  offline (the app is local-first). Triggers: marking a task (tick), habit +
 *  (ascending), habit − (descending), level up (arpeggio), invocation
 *  (dark drone with tritone + deep descent), schizoanalytic analysis
 *  (soft contemplative chord).
 *  Respects `settings.sound` (default on; toggle in Settings).
 *  The AudioContext is born lazy, on the first sound — after a click,
 *  so the browser's autoplay policy is satisfied. */

import { appStore } from '../stores/base'

type SoundType = 'tarefa' | 'habito-pos' | 'habito-neg' | 'nivel' | 'invocar' | 'analise'

let ctx: AudioContext | null = null

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  if (!ctx) ctx = new AC()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** Plays a sound effect (no-op if sound is off or unsupported). */
export function playSound(type: SoundType): void {
  if (appStore.get().settings.sound === false) return
  const c = getContext()
  if (!c) return
  const t = c.currentTime
  if (type === 'tarefa') tick(c, t)
  else if (type === 'habito-pos') positiveHabit(c, t)
  else if (type === 'habito-neg') negativeHabit(c, t)
  else if (type === 'nivel') arpeggio(c, t)
  else if (type === 'invocar') shadowyInvocation(c, t)
  else contemplativeAnalysis(c, t)
}

/** Task-marking tick: sine 660→880Hz, 90ms, fast. */
function tick(c: AudioContext, t: number): void {
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.25, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
  g.connect(c.destination)
  const o = c.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(660, t)
  o.frequency.exponentialRampToValueAtTime(880, t + 0.05)
  o.connect(g)
  o.start(t)
  o.stop(t + 0.1)
}

/** POSITIVE habit: two ascending notes (A5→E6) — a "going up" feeling. */
function positiveHabit(c: AudioContext, t: number): void {
  const notes = [880.0, 1318.51]
  for (const [i, freq] of notes.entries()) {
    const start = t + i * 0.06
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, start)
    g.gain.exponentialRampToValueAtTime(0.22, start + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.14)
    g.connect(c.destination)
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.value = freq
    o.connect(g)
    o.start(start)
    o.stop(start + 0.15)
  }
}

/** NEGATIVE habit: deep descent (E4→E3), opaque timbre — "going down". */
function negativeHabit(c: AudioContext, t: number): void {
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.2, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
  g.connect(c.destination)
  const o = c.createOscillator()
  o.type = 'triangle'
  o.frequency.setValueAtTime(329.63, t) // E4
  o.frequency.exponentialRampToValueAtTime(164.81, t + 0.3) // E3
  o.connect(g)
  o.start(t)
  o.stop(t + 0.4)
}

/** Level-up fanfare: arpeggio C5–E5–G5 (triangle), notes 90ms apart. */
function arpeggio(c: AudioContext, t: number): void {
  const notes = [523.25, 659.25, 783.99]
  for (const [i, freq] of notes.entries()) {
    const start = t + i * 0.09
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, start)
    g.gain.exponentialRampToValueAtTime(0.3, start + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.5)
    g.connect(c.destination)
    const o = c.createOscillator()
    o.type = 'triangle'
    o.frequency.value = freq
    o.connect(g)
    o.start(start)
    o.stop(start + 0.55)
  }
}

/** SHADOWY invocation: low drone (A2) + tritone (Eb3 — the "diabolus in
 *  musica") + descent 220→55Hz, slow attack and ~2s tail, all passed
 *  through a low-pass filter to darken the timbre. */
function shadowyInvocation(c: AudioContext, t: number): void {
  const master = c.createGain()
  master.gain.setValueAtTime(0.0001, t)
  master.gain.exponentialRampToValueAtTime(0.45, t + 0.35)
  master.gain.exponentialRampToValueAtTime(0.0001, t + 2.2)
  master.connect(c.destination)

  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 700
  lp.connect(master)

  const drone = c.createOscillator()
  drone.type = 'triangle'
  drone.frequency.value = 110 // A2
  const gDrone = c.createGain()
  gDrone.gain.value = 0.6
  drone.connect(gDrone)
  gDrone.connect(lp)

  const tritone = c.createOscillator()
  tritone.type = 'sine'
  tritone.frequency.value = 155.56 // Eb3 — tritone
  const gTri = c.createGain()
  gTri.gain.value = 0.35
  tritone.connect(gTri)
  gTri.connect(lp)

  const descent = c.createOscillator()
  descent.type = 'sawtooth'
  descent.frequency.setValueAtTime(220, t)
  descent.frequency.exponentialRampToValueAtTime(55, t + 1.1)
  const gDesc = c.createGain()
  gDesc.gain.value = 0.12
  descent.connect(gDesc)
  gDesc.connect(lp)

  drone.start(t)
  tritone.start(t)
  descent.start(t)
  drone.stop(t + 2.3)
  tritone.stop(t + 2.3)
  descent.stop(t + 2.3)
}

/** Schizoanalytic analysis: contemplative minor chord (A3–C4–E4) with slow
 *  attack and soft tail — introspective, without the heaviness of the
 *  invocation's darkness. */
function contemplativeAnalysis(c: AudioContext, t: number): void {
  const notes = [220.0, 261.63, 329.63] // A3, C4, E4 — A minor
  const master = c.createGain()
  master.gain.setValueAtTime(0.0001, t)
  master.gain.exponentialRampToValueAtTime(0.28, t + 0.4) // slow attack
  master.gain.exponentialRampToValueAtTime(0.0001, t + 2.0) // tail
  master.connect(c.destination)

  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 1400
  lp.connect(master)

  for (const [i, freq] of notes.entries()) {
    const o = c.createOscillator()
    o.type = i === 0 ? 'triangle' : 'sine'
    o.frequency.value = freq
    const g = c.createGain()
    g.gain.value = i === 0 ? 0.5 : 0.3
    o.connect(g)
    g.connect(lp)
    o.start(t)
    o.stop(t + 2.1)
  }
}
