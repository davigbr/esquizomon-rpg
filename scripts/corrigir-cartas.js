/**
 * Corrige os dados de produção após a mudança de raridade das cartas
 * (2026-08-12: 2 → 1 carta por nível; monstro 3×, captura 2×, aliança 1×).
 *
 * COMO USAR: abra o app (produção), F12 → Console, cole o conteúdo e Enter.
 * O script recalcula o teto do deck para o nível atual (7 iniciais + 1 por
 * nível acima do 1º) e remove o EXCEDENTE, preservando primeiro as cartas
 * mais raras (aliança > captura > monstro).
 *
 * Atenção: recarregue a página depois para o app reler o storage.
 * Faça backup antes: Config → Exportar (ou copie o JSON do console).
 */
(() => {
  const CHAVE = 'esquizomon-rpg:v1'
  const bruto = localStorage.getItem(CHAVE)
  if (!bruto) {
    console.error('[corrigir-cartas] Nada salvo na chave', CHAVE)
    return
  }
  const dados = JSON.parse(bruto)
  const p = dados.personagem ?? {}
  const cartas = Array.isArray(p.cartas) ? [...p.cartas] : []
  const nivel = typeof p.nivel === 'number' ? p.nivel : 1
  const teto = 7 + Math.max(0, nivel - 1)
  if (cartas.length <= teto) {
    console.log(`[corrigir-cartas] Nada a corrigir: nível ${nivel} justifica até ${teto} cartas e você tem ${cartas.length}.`)
    return
  }
  const deck = window.esquizomonDeck ?? []
  const tipoDe = (id) => (deck.find((c) => c.id === id)?.type ?? 'monstro')
  const pesoDe = (id) => (tipoDe(id) === 'alianca' ? 3 : tipoDe(id) === 'captura' ? 2 : 1)
  const excedente = cartas.length - teto
  const aRemover = [...cartas]
    .sort((a, b) => pesoDe(a) - pesoDe(b)) // menos raras primeiro
    .slice(0, excedente)
  p.cartas = cartas.filter((id) => !aRemover.includes(id))
  localStorage.setItem(CHAVE, JSON.stringify(dados))
  console.log(`[corrigir-cartas] Removidas ${excedente} carta(s) do excedente (nível ${nivel} → teto ${teto}).`)
  console.log('Removidas:', aRemover.map((id) => `${tipoDe(id)}:${id}`).join(', '))
  console.log('Sobraram:', p.cartas.length, '— recarregue a página (F5).')
})()
