/** Store global — ponto de entrada dos consumidores (views, IA, main).
 *  Re-exporta os domínios; cada domínio vive em seu módulo e importa apenas
 *  do núcleo (base.ts) — sem ciclos. */

export * from './base'
export * from './personagem'
export * from './tarefas'
export * from './checkin'
export * from './diario'
export * from './conversas'
export * from './config'
