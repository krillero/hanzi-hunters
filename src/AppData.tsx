import { BUILD, formatBuild } from './appInfo'

type Props = { outdated: boolean; onUpdate: () => void; onExport: () => void; onImport: (file: File) => void }

/** Version, "Update app" (keeps progress), and export/import of progress. Used by the camp and the menu. */
export default function AppData({ outdated, onUpdate, onExport, onImport }: Props) {
  return (
    <section className="app-data" aria-label="App and data">
      <h3>App &amp; data</h3>
      <p className="hint-text">Version {formatBuild(BUILD)}{outdated ? ' — a newer version is available' : ''}</p>
      <div className="app-data-row">
        <button className={`secondary-btn ${outdated ? 'attention' : ''}`} onClick={onUpdate}>⟳ Update app</button>
        <button className="secondary-btn" onClick={onExport}>⬇ Export progress</button>
        <label className="secondary-btn file-btn">⬆ Import progress<input type="file" accept="application/json,.json" onChange={e => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = '' }} /></label>
      </div>
      <p className="hint-text">“Update app” fetches the newest version and never deletes your progress. Export a backup before clearing browser data.</p>
    </section>
  )
}
