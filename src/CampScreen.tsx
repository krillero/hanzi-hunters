import { useState } from 'react'
import { BRANCHES, branchNodes, nodeState, upgradeCost, type UpgradeNode } from './game/upgrades'
import type { CourseStatus } from './game/course'
import type { Saved } from './game/types'

type Props = {
  save: Saved
  course: CourseStatus
  runMilestones: string[]            // names of milestones earned during the run that just ended (not persisted)
  onBuy: (id: string) => void
  onStart: () => void
  message: string
}

/**
 * Base camp between runs: the run result, the course position, upgrades, and one pinned start button.
 * Stats, milestones, backups and reset live in the Settings sheet (MenuSheet), not here.
 */
export default function CampScreen({ save, course, runMilestones, onBuy, onStart, message }: Props) {
  const { meta, lastRun, mastery } = save
  const [tab, setTab] = useState(BRANCHES[0].id)
  const owned = (branch: string) => branchNodes(branch).filter(n => meta.upgrades.includes(n.id)).length
  const canBuy = (n: UpgradeNode) => nodeState(meta.upgrades, n) === 'available' && meta.gold >= upgradeCost(n.tier)
  const buyable = BRANCHES.flatMap(b => branchNodes(b.id)).filter(canBuy).length
  const known = Object.keys(mastery).length
  const wordsLine = `${known} word${known === 1 ? '' : 's'}`
  const lessonPct = course.lessonsTotal ? Math.round(course.lessonsCompleted / course.lessonsTotal * 100) : 0

  return (
    <section className="camp" aria-label="Base camp">
      <div className="camp-head">
        <p className="eyebrow">{lastRun ? 'RUN OVER' : 'BASE CAMP'}</p>
        <h1>{lastRun ? (lastRun.returned ? `You returned from floor ${lastRun.floor}` : `You fell on floor ${lastRun.floor}`) : 'Prepare for the descent'}</h1>
        {lastRun
          ? <p className="camp-result"><span>{lastRun.kills} slain</span><span>Level {lastRun.level}</span><span className="gain">+{lastRun.goldBanked} gold</span></p>
          : <p className="camp-result">Upgrades and the words you learn stay between runs.</p>}
        {runMilestones.length > 0 && <p className="camp-milestone" role="status"><span aria-hidden="true">★</span> New milestone: {runMilestones.join(', ')}</p>}
      </div>

      <div className="camp-course" role="status">
        {course.lesson
          ? <>
              <div className="camp-course-top"><span>LESSON {course.lesson.number} OF {course.lessonsTotal}</span><span>{wordsLine}</span></div>
              <strong>{course.lesson.unit.title}</strong>
            </>
          : <>
              <div className="camp-course-top"><span>COURSE COMPLETE</span><span>{wordsLine}</span></div>
              <strong>{course.title}: all {course.lessonsTotal} lessons done</strong>
            </>}
        <div className="camp-course-bar" role="img" aria-label={`${course.lessonsCompleted} of ${course.lessonsTotal} lessons done`}><i style={{ width: `${lessonPct}%` }} /></div>
      </div>

      {message && <div className="toast camp-toast"><span>{message}</span></div>}

      <div className="camp-upgrades">
        <div className="camp-upgrades-head"><h2>Upgrades</h2>{buyable > 0 && <span>{buyable} you can buy</span>}</div>
        <div className="tree-tabs" role="tablist">
          {BRANCHES.map(b => (
            <button key={b.id} role="tab" aria-selected={tab === b.id} className={tab === b.id ? 'on' : ''} onClick={() => setTab(b.id)}>
              {b.name}<small>{owned(b.id)}/5</small>
            </button>
          ))}
        </div>
        <div className="tree">
          {BRANCHES.map(b => {
            const nodes = branchNodes(b.id)
            const firstLocked = nodes.findIndex(n => nodeState(meta.upgrades, n) === 'locked')
            const shown = firstLocked < 0 ? nodes : nodes.slice(0, firstLocked + 1)
            const more = nodes.length - shown.length
            return (
              <div key={b.id} className={`branch ${tab === b.id ? 'show' : ''}`}>
                <h3 className="branch-name">{b.name} <small>{owned(b.id)}/5</small></h3>
                <ol>
                  {shown.map(n => {
                    const state = nodeState(meta.upgrades, n)
                    const cost = upgradeCost(n.tier)
                    const affordable = canBuy(n)
                    return (
                      <li key={n.id} className={`node ${state} ${affordable ? 'affordable' : ''}`}>
                        <button disabled={!affordable} onClick={() => onBuy(n.id)} aria-label={`${n.name}: ${n.desc}. ${state === 'owned' ? 'Owned' : state === 'locked' ? `Locked, ${cost} gold` : affordable ? `Buy for ${cost} gold` : `${cost} gold, you need ${cost - meta.gold} more`}`}>
                          <span className="node-text"><b>{n.name}</b><small>{n.desc}</small></span>
                          <span className="node-cost">
                            {state === 'owned' ? 'Owned' : state === 'locked' ? `Locked · ${cost}` : affordable ? <span className="node-buy">Buy {cost}</span> : <>{cost}<small>need {cost - meta.gold}</small></>}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ol>
                {more > 0 && <p className="branch-more">+ {more} more in this branch</p>}
              </div>
            )
          })}
        </div>
      </div>

      <div className="camp-start-bar">
        <button className="primary-btn camp-start" onClick={onStart}>{lastRun ? 'Descend again' : 'Start the descent'} <span aria-hidden="true">→</span></button>
      </div>
    </section>
  )
}
