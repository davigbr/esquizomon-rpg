/** Store global — ponto de entrada dos consumidores (views, IA, main).
 *  Re-exports the domains; each domain lives in its own module and imports only
 *  from the core (base.ts) — no cycles. */

export * from './base'
export * from './personagem'
export * from './tasks'
export * from './checkin'
export * from './diary'
export * from './conversas'
export * from './settings'
