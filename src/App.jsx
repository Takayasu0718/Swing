import { useEffect, useState } from 'react'
import './App.css'

const STORAGE_KEY = 'swing-app:history'

function todayKey() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function App() {
  const [history, setHistory] = useState(loadHistory)
  const [input, setInput] = useState('')

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
  }, [history])

  const today = todayKey()
  const todayCount = history[today] ?? 0
  const total = Object.values(history).reduce((a, b) => a + b, 0)

  const add = () => {
    const n = parseInt(input, 10)
    if (!Number.isFinite(n) || n <= 0) return
    setHistory((h) => ({ ...h, [today]: (h[today] ?? 0) + n }))
    setInput('')
  }

  const reset = () => {
    if (confirm('記録をすべて削除しますか？')) setHistory({})
  }

  const recent = Object.entries(history)
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .slice(0, 7)

  return (
    <main className="app">
      <h1>素振りカウンター</h1>

      <section className="stats">
        <div className="stat">
          <div className="stat-label">今日</div>
          <div className="stat-value">{todayCount.toLocaleString()}</div>
          <div className="stat-unit">回</div>
        </div>
        <div className="stat">
          <div className="stat-label">累計</div>
          <div className="stat-value">{total.toLocaleString()}</div>
          <div className="stat-unit">回</div>
        </div>
      </section>

      <section className="input-row">
        <input
          type="number"
          inputMode="numeric"
          min="1"
          placeholder="回数を入力"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button onClick={add}>追加</button>
      </section>

      <section className="quick">
        {[10, 50, 100].map((n) => (
          <button key={n} className="quick-btn" onClick={() => {
            setHistory((h) => ({ ...h, [today]: (h[today] ?? 0) + n }))
          }}>
            +{n}
          </button>
        ))}
      </section>

      {recent.length > 0 && (
        <section className="history">
          <h2>履歴</h2>
          <ul>
            {recent.map(([date, count]) => (
              <li key={date}>
                <span>{date}{date === today && ' (今日)'}</span>
                <span>{count.toLocaleString()} 回</span>
              </li>
            ))}
          </ul>
          <button className="reset" onClick={reset}>記録をリセット</button>
        </section>
      )}
    </main>
  )
}

export default App
