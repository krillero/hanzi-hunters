// The AGENTS.md / DEVELOPMENT_BRIEF.md rules that a grep can check, checked, so they hold without anyone remembering them.
// Each rule says why it exists. When a new rule can be checked this way, add it here (with its reason), not only to the docs.
//
// - Pure modules (src/game except PixelScene.ts, src/content, src/sources) use no React, Phaser or browser globals: tests, the
//   simulator and the source tools run them in plain Node, and the review screen shares src/sources with the tools.
// - Phaser is imported only by the battle scene and the component that mounts it: Phaser renders, React owns state (AGENTS rule 5).
// - The scheduling core never reads the clock: every time is passed in, so the scheduler is deterministic in tests and the
//   simulator can run months of play in seconds. Other pure modules read it only as a default parameter, for the same reason.
// - Browser storage is touched only by App.tsx (game save, settings) and ReviewApp.tsx (review drafts): a component that writes
//   the save itself would bypass sanitizeSave / withLearning and could corrupt progress (AGENTS rule 9).
// - No style targets screens narrower than 360 px, the narrowest supported width (AGENTS rule 6).
// - No code writes the review status "human-reviewed": only a person may mark content reviewed (CONTENT_GUIDE §4, SOURCES.md).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

function filesIn(dir: string, ext: RegExp): string[] {
  const out: string[] = []
  for (const name of readdirSync(join(root, dir))) {
    const rel = join(dir, name)
    if (statSync(join(root, rel)).isDirectory()) out.push(...filesIn(rel, ext))
    else if (ext.test(name)) out.push(rel)
  }
  return out
}

/** Code lines only: prose in comments may name the very thing a rule forbids. */
function codeLines(file: string): { line: string; at: string }[] {
  return readFileSync(join(root, file), 'utf8').split('\n')
    .map((line, i) => ({ line, at: `${file}:${i + 1}` }))
    .filter(({ line }) => !/^\s*(\/\/|\*|\/\*)/.test(line))
}

/** Every line of `files` that matches `pattern`, as "file:line: text". */
function breaches(files: string[], pattern: RegExp, allowed: (line: string) => boolean = () => false): string[] {
  return files.flatMap(f => codeLines(f).filter(({ line }) => pattern.test(line) && !allowed(line)).map(({ line, at }) => `${at}: ${line.trim().slice(0, 100)}`))
}

const TS = /\.tsx?$/
const pureModules = [...filesIn('src/game', TS).filter(f => !f.endsWith('PixelScene.ts')), ...filesIn('src/content', TS), ...filesIn('src/sources', TS)]
const appCode = filesIn('src', TS)

test('pure modules use no React, Phaser or browser globals', () => {
  const browser = /from ['"](react|react-dom|phaser)['"]|\b(document|window|navigator|localStorage|sessionStorage)\./
  assert.ok(browser.test(`import { useState } from 'react'`) && browser.test('window.setTimeout(f, 1)'), 'the pattern still catches a breach')
  assert.deepEqual(breaches(pureModules, browser), [])
})

test('Phaser is imported only by the battle scene and the component that mounts it', () => {
  const importers = appCode.filter(f => codeLines(f).some(({ line }) => /from ['"]phaser['"]/.test(line)))
  assert.deepEqual(importers.sort(), ['src/App.tsx', 'src/game/PixelScene.ts'])
})

test('the scheduling core never reads the clock; other pure modules only as a default parameter', () => {
  const core = ['schedule', 'learning', 'status', 'course', 'questions', 'progress'].map(n => `src/game/${n}.ts`)
  const clock = /Date\.now\(\)|new Date\(\)/
  assert.ok(clock.test('const t = Date.now()') && !clock.test('new Date(y, m - 1, d)'), 'a date built from parts is not a clock read')
  assert.deepEqual(breaches(core, clock), [])
  assert.deepEqual(breaches(pureModules.filter(f => !core.includes(f)), clock, line => /[=:]\s*(Date\.now\(\)|new Date\(\))/.test(line)), [])
})

test('browser storage is touched only by App.tsx and ReviewApp.tsx', () => {
  const touching = appCode.filter(f => codeLines(f).some(({ line }) => /\b(localStorage|sessionStorage)\b/.test(line)))
  assert.deepEqual(touching.sort(), ['src/App.tsx', 'src/review/ReviewApp.tsx'])
})

test('no style targets screens narrower than 360 px', () => {
  const css = filesIn('src', /\.css$/)
  const narrow = breaches(css, /max-width:\s*\d+px/, line => Number(line.match(/max-width:\s*(\d+)px/)![1]) >= 360)
    .filter(b => /@media/.test(b))
  assert.deepEqual(narrow, [])
})

test('no code marks content "human-reviewed"', () => {
  const code = [...appCode, ...filesIn('tools', TS)]
  // Allowed: the list of valid statuses, type unions and comparisons. Forbidden: assigning it.
  const assigns = /(?<![.\w])(status|review)\s*[:=]\s*['"]human-reviewed['"]/
  assert.ok(assigns.test(`review: 'human-reviewed'`) && assigns.test(`{ status: "human-reviewed" }`) && !assigns.test('err(`${at}.review: "human-reviewed" needs`)'))
  assert.deepEqual(breaches(code, assigns), [])
})
