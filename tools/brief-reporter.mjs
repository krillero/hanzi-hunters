// Compact test reporter: one line per failure (test, first lines of the message, file:line) and a summary.
// Use: npm run test:brief            (all tests)
//      npm run test:brief -- tests/rules.test.ts   (some files)
export default async function* briefReporter(source) {
  let pass = 0, fail = 0
  const started = Date.now()
  for await (const event of source) {
    if (event.type === 'test:pass' && event.data.details?.type !== 'suite') pass++
    if (event.type === 'test:fail' && event.data.details?.type !== 'suite') {
      const err = event.data.details?.error
      const cause = err?.cause ?? err
      // file-level failures (a whole file crashed) have no test of their own: report them too
      fail++
      const msg = String(cause?.message ?? err?.message ?? 'failed').split('\n').filter(Boolean).slice(0, 4).join(' | ')
      const where = event.data.file ? `${event.data.file.replace(process.cwd() + '/', '')}:${event.data.line ?? '?'}` : ''
      const vals = cause && 'expected' in cause ? ` (expected ${JSON.stringify(cause.expected)}, got ${JSON.stringify(cause.actual)})` : ''
      yield `FAIL ${event.data.name}\n     ${msg}${vals}\n     at ${where}\n`
    }
  }
  yield `${fail ? 'FAILED' : 'OK'}: ${pass} passed, ${fail} failed (${((Date.now() - started) / 1000).toFixed(1)} s)\n`
}
