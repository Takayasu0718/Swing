import { useEffect, useRef, useState } from 'react'

export default function SearchBox({ value, onChange, placeholder, dropdown }) {
  const rootRef = useRef(null)
  const [open, setOpen] = useState(true)

  useEffect(() => {
    const onDocMouseDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  const hasDropdown = open && value.length > 0 && dropdown != null && dropdown !== false

  return (
    <div className="search-autocomplete" ref={rootRef}>
      <div className="search-box">
        <span className="search-icon" aria-hidden>🔍</span>
        <input
          type="search"
          className="search-input"
          value={value}
          onChange={(e) => {
            setOpen(true)
            onChange(e.target.value)
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
        />
      </div>
      {hasDropdown && <div className="search-dropdown" role="listbox">{dropdown}</div>}
    </div>
  )
}
