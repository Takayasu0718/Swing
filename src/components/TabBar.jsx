export default function TabBar({ tabs, active, onChange, locked, badges = {} }) {
  return (
    <nav className="tab-bar" aria-label="main navigation">
      {tabs.map((t) => {
        const isLocked = locked && t.key !== locked
        const badge = badges[t.key] || 0
        return (
          <button
            key={t.key}
            type="button"
            className={`tab ${active === t.key ? 'active' : ''}`}
            disabled={isLocked}
            onClick={() => onChange(t.key)}
          >
            <span className="tab-icon" aria-hidden>
              {t.iconImg ? (
                <img src={t.iconImg} alt="" className="tab-icon-img" />
              ) : (
                t.icon
              )}
              {badge > 0 && (
                <span className="tab-badge">{badge > 99 ? '99+' : badge}</span>
              )}
            </span>
            <span className="tab-label">{t.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
