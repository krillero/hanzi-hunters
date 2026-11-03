// Documentation stays findable and does not point at things that are gone. A new agent starts from the map in README.md, so every
// top-level doc must be on it; and a doc that names a file that was moved or deleted sends the reader to the wrong place (a docs
// audit found several). Historical text is exempt: CHANGELOG.md and the archived vocabulary toolkit.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'archive'])

function markdownFiles(dir = ''): string[] {
  const out: string[] = []
  for (const name of readdirSync(join(root, dir))) {
    const rel = dir ? `${dir}/${name}` : name
    if (SKIP_DIRS.has(name) || rel === 'public/sources') continue
    if (statSync(join(root, rel)).isDirectory()) out.push(...markdownFiles(rel))
    else if (name.endsWith('.md')) out.push(rel)
  }
  return out
}

const docs = markdownFiles().filter(f => f !== 'CHANGELOG.md')

test('every file path named in the docs exists', () => {
  // `src/...`, `docs/...`, `tools/...` and similar in backticks, plus bare doc names such as `GAME_DESIGN.md`.
  const pathPattern = /`((?:src|docs|tools|tests|public|review|\.github)\/[A-Za-z0-9_./\-]+|[A-Z_]+\.md)`/g
  const missing: string[] = []
  for (const doc of docs) {
    for (const m of readFileSync(join(root, doc), 'utf8').matchAll(pathPattern)) {
      const path = m[1].replace(/[.,]$/, '')
      const candidates = [path, join(dirname(doc), path), `docs/${path}`]
      if (!candidates.some(c => existsSync(join(root, c)))) missing.push(`${doc}: ${path}`)
    }
  }
  assert.deepEqual(missing, [])
})

test('the documentation map in README.md lists every top-level doc', () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8')
  const topLevel = [
    ...readdirSync(root).filter(f => f.endsWith('.md') && f !== 'README.md'),
    ...readdirSync(join(root, 'docs')).filter(f => f.endsWith('.md')).map(f => `docs/${f}`)
  ]
  const unlisted = topLevel.filter(f => !readme.includes(`\`${f}\``))
  assert.deepEqual(unlisted, [], 'add each doc to the map in README.md (or link it from the doc that owns its topic)')
})
