/** Voz para o Diário — Web Speech API (SpeechRecognition) com fallback gracioso.
 *  Tudo roda no dispositivo: nada vai a servidor, sem chave, sem IA externa. */

type Reconhecedor = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
}

function obterReconhecedor(): Reconhecedor | null {
  const w = window as unknown as Record<string, unknown>
  const Ctor =
    (w.SpeechRecognition as new () => Reconhecedor | undefined) ??
    (w.webkitSpeechRecognition as new () => Reconhecedor | undefined)
  if (!Ctor) return null
  try {
    return new Ctor() ?? null
  } catch {
    return null
  }
}

/** True se o navegador tem Web Speech API disponível. */
export function suportaVoz(): boolean {
  return obterReconhecedor() !== null
}

export interface GravacaoVoz {
  /** Finaliza a gravação (chama os callbacks pendentes). */
  parar: () => void
}

/** Inicia uma gravação de voz. `aoParcial` recebe o que já foi reconhecido
 *  (interim + final); `aoFinal` recebe o texto consolidado ao parar. */
export function gravarVoz(opts: {
  aoParcial: (texto: string) => void
  aoFinal: (texto: string) => void
  aoErro: (msg: string) => void
}): GravacaoVoz | null {
  const rec = obterReconhecedor()
  if (!rec) {
    opts.aoErro('Seu navegador não suporta ditado por voz.')
    return null
  }

  rec.lang = 'pt-BR'
  rec.continuous = true
  rec.interimResults = true

  let final = ''
  let finalizou = false

  rec.onresult = (e) => {
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const resultado = e.results[i]
      const texto = resultado[0]?.transcript ?? ''
      if (resultado && 'isFinal' in resultado && (resultado as { isFinal?: boolean }).isFinal) {
        final += texto
      } else {
        interim += texto
      }
    }
    opts.aoParcial(final + interim)
  }

  rec.onend = () => {
    if (!finalizou) {
      finalizou = true
      opts.aoFinal(final)
    }
  }

  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      opts.aoErro('Microfone bloqueado — permita o acesso na barra de endereço.')
    } else if (e.error === 'no-speech') {
      // Silencioso: o usuário pode ter parado de falar; não é erro fatal.
      rec.stop()
    } else {
      opts.aoErro(`Erro de voz: ${e.error}`)
    }
  }

  try {
    rec.start()
  } catch {
    opts.aoErro('Não consegui iniciar o microfone.')
    return null
  }

  return {
    parar: () => {
      try {
        rec.stop()
      } catch {
        /* já parado */
      }
      // Garante o callback final mesmo se onend não disparar.
      setTimeout(() => {
        if (!finalizou) {
          finalizou = true
          opts.aoFinal(final)
        }
      }, 50)
    },
  }
}
