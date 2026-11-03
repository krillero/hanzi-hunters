// A real scheduler entry for test fixtures that care only about the level and the initial-success count: the shape of
// `entryAtLevel`, but with `ok` as given and nothing due. (`entryAtLevel` makes level 2+ fully learned and due now, which would
// change which question kinds and reviews these tests exercise.) Use it instead of `{ lv, ok }` literals, which miss the
// scheduling fields and only passed because Node's type stripping checks nothing; `npm run typecheck` now covers tests/.
import { entryAtLevel, type SchedEntry } from '../../src/game/schedule.ts'

export const sched = (lv: number, ok = 0): SchedEntry => ({ ...entryAtLevel(lv), ok, due: null })
