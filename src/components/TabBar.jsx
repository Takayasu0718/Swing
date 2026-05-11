// badges[key] は number または { count, dot }。
// count > 0 なら数値バッジ、count==0 で dot==true なら赤ドットだけ表示。
function parseBadge(b) {
  if (typeof b === 'number') return { count: b, dot: false }
  if (b && typeof b === 'object') return { count: b.count || 0, dot: !!b.dot }
  return { count: 0, dot: false }
}

export default function TabBar({ tabs, active, onChange, locked, badges = {} }) {
  return (
    <nav className="tab-bar" aria-label="main navigation">
      {tabs.map((t) => {
        const isLocked = locked && t.key !== locked
        const { count, dot } = parseBadge(badges[t.key])
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
                <span
                  className="tab-icon-img"
                  style={{
                    WebkitMaskImage: `url(${t.iconImg})`,
                    maskImage: `url(${t.iconImg})`,
                  }}
                />
              ) : (
                t.icon
              )}
              {count > 0 ? (
                <span className="tab-badge">{count > 99 ? '99+' : count}</span>
              ) : dot ? (
                <span className="tab-badge tab-badge-dot" aria-label="未対応の通知あり" />
              ) : null}
            </span>
            <span className="tab-label">{t.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
