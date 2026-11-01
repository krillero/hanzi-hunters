// Small presentation helpers for the battle screen.

/** Size class for long entries: 1-2 characters are big, 3-4 smaller, longer smaller still (so they fit the card and the answer buttons). */
export const lenClass = (s: string) => { const n = [...s.replace(/\s+/g, '')].length; return n <= 2 ? 1 : n <= 4 ? 3 : n <= 7 ? 5 : 8 }

/** The authored sentence with its ___ blank shown as an empty box, or filled with the answer once it is known. */
export const fillBlank = (text: string, answer: string | null) => {
  const [before, after] = text.split('___')
  return <>{before}<span className={`blank ${answer ? 'filled' : ''}`}>{answer ?? '＿＿'}</span>{after}</>
}
