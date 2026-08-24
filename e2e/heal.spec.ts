/** Healing button: spends a high mana cost to fully heal HP and clear depleted. */
import { test, expect } from '@playwright/test'

test('cura: gasta mana e cura TODA a vida, removendo esgotado', async ({ page }) => {
  // primeiro boot cria o dado default no localStorage
  await page.goto('/#/today')
  await page.waitForTimeout(300)
  // seed o personagem: vida baixa, mana cheia, esgotado
  await page.evaluate(() => {
    const base = JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? 'null')
    if (base) {
      base.character = {
        ...base.character,
        hp: 10,
        hpMax: base.character.hpMax,
        mana: base.character.manaMax,
        exhausted: true,
      }
      localStorage.setItem('esquizomon-rpg:v1', JSON.stringify(base))
    }
  })
  await page.reload()
  await page.waitForTimeout(400)

  const heal = page.locator('[data-heal]')
  await expect(heal).toBeVisible()
  // vida incompleta e mana cheia → habilitado
  await expect(heal).toBeEnabled()

  // registra mana antes
  const manaBefore = await page.locator('[data-s-mana]').textContent()

  // 1 clique: cura toda a vida e remove esgotado
  await heal.click()
  await page.waitForTimeout(200)

  // vida cheia
  const hp = await page.locator('[data-s-hp]').textContent()
  const [, max] = (hp ?? '').split('/')
  await expect(page.locator('[data-s-hp]')).toHaveText(`${max}/${max}`)
  // mana diminuiu
  const manaAfter = await page.locator('[data-s-mana]').textContent()
  expect(manaAfter).not.toBe(manaBefore)
  // depleted cleared
  await expect(page.locator('[data-s-esgotado]')).toBeHidden()
  // button disabled (full health)
  await expect(heal).toBeDisabled()
})