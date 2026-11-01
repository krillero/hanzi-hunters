// Layout stability check: the battle screen must not move or resize when you answer.
// Usage (dev server running):  node tools/layout-check.mjs [baseUrl]   (needs `playwright` installed, e.g. globally)
import { createRequire } from 'node:module'
const require = createRequire(process.env.PW_ROOT ? process.env.PW_ROOT + '/' : import.meta.url)
const { chromium } = require('playwright')
const base = process.argv[2] ?? 'http://localhost:5173'
const KNOWN = ['人', '大', '小', '一', '二', '三', '日', '月', '水', '火', '山', '木', '目', '口', '天', '石', '十']
const save = (enemyHp) => ({ version: 2, meta: { gold: 0, upgrades: [], bestFloor: 1, runs: 0 }, lastRun: null, mastery: Object.fromEntries(KNOWN.map(h => [h, { lv: 2, ok: 0 }])), run: { floor: 2, kill: 0, kills: 3, level: 3, xp: 0, hp: 71, enemyHp, gold: 77, potions: 2, gear: [], streak: 0, hintsLeft: 0, secondLeft: 0, phase: 'fighting', reward: { xp: 0, gold: 0, loot: '', levelUps: 0 } } })
const SLOTS = { arena: '.phaser-mount', card: '.stage-card', slotHanzi: '.slot-hanzi', choices: '.answer-list', bar: '.action-bar', tools: '.compact-tools' }
const snap = (p) => p.evaluate((sels) => { const o = {}; for (const [k, s] of Object.entries(sels)) { const e = document.querySelector(s); const r = e?.getBoundingClientRect(); o[k] = r ? `${Math.round(r.top)}/${Math.round(r.height)}` : 'missing' } const sh = document.querySelector('.app-shell'); o.overflow = sh.scrollHeight - sh.clientHeight; return o }, SLOTS)
const browser = await chromium.launch(); let bad = 0
for (const [w, h] of [[411, 650], [390, 844], [360, 800], [360, 640]]) for (const [name, hp, pickRight] of [['wrong answer, longest note', 99, false], ['kill with rewards', 5, true]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true }); const p = await ctx.newPage()
  await p.goto(base); await p.evaluate(([s, t]) => { localStorage.setItem('hanzi-hunters-save-v2', JSON.stringify(s)); localStorage.setItem('hanzi-hunters-settings-v1', JSON.stringify(t)) }, [save(hp), { muted: false, autoContinue: 'off' }])
  await p.goto(`${base}/?word=${encodeURIComponent('目')}&kind=meaning`); await p.waitForSelector('.answer-btn'); await p.waitForTimeout(600)
  const before = await snap(p); const texts = await p.locator('.answer-btn .answer-text').allInnerTexts()
  const i = texts.findIndex(t => /eye/i.test(t)); await p.locator('.answer-btn').nth(pickRight ? i : (i + 1) % texts.length).click(); await p.waitForSelector('.answer-feedback'); await p.waitForTimeout(500)
  const after = await snap(p)
  const diffs = Object.keys(SLOTS).filter(k => before[k] !== after[k]).map(k => `${k} ${before[k]} → ${after[k]}`)
  if (after.overflow > 0 || before.overflow > 0) diffs.push(`page overflows by ${before.overflow}/${after.overflow}px`)
  console.log(`${diffs.length ? 'FAIL' : 'ok  '} ${w}x${h} ${name}${diffs.length ? ': ' + diffs.join('; ') : ''}`); bad += diffs.length; await ctx.close()
}
await browser.close(); process.exit(bad ? 1 : 0)
