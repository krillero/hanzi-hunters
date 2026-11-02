// Compact test reporter: one line per failure (test, first lines of the message, file:line) and a summary.
// Use: npm run test:brief            (all tests)
//      npm run test:brief -- tests/rules.test.ts   (some files)
// A failure's cause is not always an Error: a file that crashes on import, or a test that throws a string, reports a plain
// string. Only objects are inspected for message / expected / actual.
const isObj = x => x !== null && typeof x === 'object'

export default async function* briefReporter(source) {
  let pass = 0, fail = 0
  const stderr = new Map()   // file -> its stderr output: the real error of a file that crashed on import
  const started = Date.now()
  for await (const event of source) {
    if (event.type === 'test:stderr' && event.data.file) stderr.set(event.data.file, (stderr.get(event.data.file) ?? '') + event.data.message)
    if (event.type === 'test:pass' && event.data.details?.type !== 'suite') pass++
    if (event.type === 'test:fail' && event.data.details?.type !== 'suite') {
      const err = event.data.details?.error
      const cause = isObj(err?.cause) ? err.cause : err?.cause ?? err
      // file-level failures (a whole file crashed) have no test of their own: report them too
      fail++
      const raw = isObj(cause) ? cause.message ?? err?.message : cause ?? err?.message
      // A whole file failed (its "test" is the file itself): show the error line from its stderr instead of "test failed".
      const fileError = event.data.name === event.data.file && stderr.get(event.data.file)?.split('\n').find(l => /^\w*Error\b|Error:/.test(l.trim()))
      const msg = String(fileError ? fileError.trim() : raw ?? 'failed').split('\n').filter(Boolean).slice(0, 4).join(' | ')
      const where = event.data.file ? `${event.data.file.replace(process.cwd() + '/', '')}:${event.data.line ?? '?'}` : ''
      const vals = isObj(cause) && 'expected' in cause ? ` (expected ${JSON.stringify(cause.expected)}, got ${JSON.stringify(cause.actual)})` : ''
      yield `FAIL ${event.data.name}\n     ${msg}${vals}\n     at ${where}\n`
    }
  }
  yield `${fail ? 'FAILED' : 'OK'}: ${pass} passed, ${fail} failed (${((Date.now() - started) / 1000).toFixed(1)} s)\n`
}
