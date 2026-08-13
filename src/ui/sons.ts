/** Efeitos sonoros sintetizados com Web Audio API — zero arquivos, funciona
 *  offline (o app é local-first). Gatilhos: marcar tarefa (tique), hábito +
 *  (ascendente), hábito − (descendente), subir de nível (arpejo), invocação
 *  (drone sombrio com trítono + descida grave), análise esquizoanalítica
 *  (acorde contemplativo suave).
 *  Respeita `configuracao.sons` (padrão ligado; toggle na Config).
 *  O AudioContext nasce preguiçoso, no primeiro som — depois de um clique,
 *  então a política de autoplay do navegador é satisfeita. */

import { appStore } from '../stores/base'

type TipoSom = 'tarefa' | 'habito-pos' | 'habito-neg' | 'nivel' | 'invocar' | 'analise'

let ctx: AudioContext | null = null

function contexto(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  if (!ctx) ctx = new AC()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** Toca um efeito sonoro (no-op se o som estiver desligado ou sem suporte). */
export function tocarSom(tipo: TipoSom): void {
  if (appStore.get().configuracao.sons === false) return
  const c = contexto()
  if (!c) return
  const t = c.currentTime
  if (tipo === 'tarefa') tique(c, t)
  else if (tipo === 'habito-pos') habitoPositivo(c, t)
  else if (tipo === 'habito-neg') habitoNegativo(c, t)
  else if (tipo === 'nivel') arpejo(c, t)
  else if (tipo === 'invocar') invocacaoSombria(c, t)
  else analiseContemplativa(c, t)
}

/** Tique de marcar tarefa: seno 660→880Hz, 90ms, rápido. */
function tique(c: AudioContext, t: number): void {
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

/** Hábito POSITIVO: duas notas ascendentes (A5→E6) — sensação de "pra cima". */
function habitoPositivo(c: AudioContext, t: number): void {
  const notas = [880.0, 1318.51]
  for (const [i, freq] of notas.entries()) {
    const inicio = t + i * 0.06
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, inicio)
    g.gain.exponentialRampToValueAtTime(0.22, inicio + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.14)
    g.connect(c.destination)
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.value = freq
    o.connect(g)
    o.start(inicio)
    o.stop(inicio + 0.15)
  }
}

/** Hábito NEGATIVO: descida grave (E4→E3), timbre opaco — "pra baixo". */
function habitoNegativo(c: AudioContext, t: number): void {
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

/** Fanfarra de nível: arpejo C5–E5–G5 (triangle), notas espaçadas 90ms. */
function arpejo(c: AudioContext, t: number): void {
  const notas = [523.25, 659.25, 783.99]
  for (const [i, freq] of notas.entries()) {
    const inicio = t + i * 0.09
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, inicio)
    g.gain.exponentialRampToValueAtTime(0.3, inicio + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.5)
    g.connect(c.destination)
    const o = c.createOscillator()
    o.type = 'triangle'
    o.frequency.value = freq
    o.connect(g)
    o.start(inicio)
    o.stop(inicio + 0.55)
  }
}

/** Invocação SOMBRIA: drone grave (A2) + trítono (Eb3 — o "diabolus in
 *  musica") + descida de 220→55Hz, ataque lento e cauda de ~2s, tudo passado
 *  por um filtro passa-baixa pra escurecer o timbre. */
function invocacaoSombria(c: AudioContext, t: number): void {
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

  const tritono = c.createOscillator()
  tritono.type = 'sine'
  tritono.frequency.value = 155.56 // Eb3 — trítono
  const gTri = c.createGain()
  gTri.gain.value = 0.35
  tritono.connect(gTri)
  gTri.connect(lp)

  const descida = c.createOscillator()
  descida.type = 'sawtooth'
  descida.frequency.setValueAtTime(220, t)
  descida.frequency.exponentialRampToValueAtTime(55, t + 1.1)
  const gDesc = c.createGain()
  gDesc.gain.value = 0.12
  descida.connect(gDesc)
  gDesc.connect(lp)

  drone.start(t)
  tritono.start(t)
  descida.start(t)
  drone.stop(t + 2.3)
  tritono.stop(t + 2.3)
  descida.stop(t + 2.3)
}

/** Análise esquizoanalítica: acorde menor contemplativo (A3–C4–E4) com ataque
 *  lento e cauda suave — introspectivo, sem o peso do sombrio da invocação. */
function analiseContemplativa(c: AudioContext, t: number): void {
  const notas = [220.0, 261.63, 329.63] // A3, C4, E4 — Lá menor
  const master = c.createGain()
  master.gain.setValueAtTime(0.0001, t)
  master.gain.exponentialRampToValueAtTime(0.28, t + 0.4) // ataque lento
  master.gain.exponentialRampToValueAtTime(0.0001, t + 2.0) // cauda
  master.connect(c.destination)

  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 1400
  lp.connect(master)

  for (const [i, freq] of notas.entries()) {
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
