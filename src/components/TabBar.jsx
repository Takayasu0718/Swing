export default function TabBar({ tabs, active, onChange, locked }) {
  return (
    <nav className="tab-bar" aria-label="main navigation">
      {tabs.map((t) => {
        const isLocked = locked && t.key !== locked
        return (
          <button
            key={t.key}
            type="button"
            className={`tab ${active === t.key ? 'active' : ''}`}
            disabled={isLocked}
            onClick={() => onChange(t.key)}
          >
            <span className="tab-icon" aria-hidden>{t.icon}</span>
            <span className="tab-label">{t.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
