import { useEffect, useRef, useState } from 'react'
import { useDm } from '../hooks/useDm.jsx'
import { useFirestoreFriends } from '../hooks/useFirestoreFriends.jsx'
import { getStamp } from '../storage/stamps.js'
import { relativeTime } from '../lib/time.js'
import {
  conversationId,
  subscribeMessages,
  sendDmMessage,
  markConversationRead,
} from '../lib/firestoreDms.js'

export default function DmOverlay() {
  const { partnerUid, closeDm } = useDm()
  const { myUid, allUsers } = useFirestoreFriends()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef(null)

  const open = Boolean(partnerUid)
  const convId = open && myUid ? conversationId(myUid, partnerUid) : null
  const partner = (allUsers || []).find((u) => u.uid === partnerUid)

  // チャット画面マウント中のみ購読、離脱時 unsubscribe
  useEffect(() => {
    if (!convId) return
    const unsub = subscribeMessages(convId, setMessages)
    markConversationRead(convId)
    return () => {
      unsub()
    }
  }, [convId])

  // 新着到着で既読更新（自動スクロールも）
  useEffect(() => {
    if (!convId || messages.length === 0) return
    markConversationRead(convId)
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [convId, messages.length])

  // ESC で閉じる
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeDm()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, closeDm])

  if (!open || !myUid) return null

  const send = async () => {
    if (sending) return
    const text = input.trim()
    if (!text) return
    setSending(true)
    setInput('')
    try {
      await sendDmMessage(convId, partnerUid, text)
    } finally {
      setSending(false)
    }
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="dm-overlay" role="dialog" aria-modal="true">
      <header className="dm-header">
        <button type="button" className="dm-back" onClick={closeDm} aria-label="閉じる">‹</button>
        <span className="activity-stamp" aria-hidden>{getStamp(partner?.avatarStamp).label}</span>
        <div className="dm-header-name">{partner?.nickname ?? '相手'}</div>
      </header>

      <div className="dm-list" ref={listRef}>
        {messages.length === 0 ? (
          <div className="empty-txt" style={{ padding: '2rem 1rem', textAlign: 'center' }}>
            まだメッセージはありません。最初の一通を送ってみよう！
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.senderUid === myUid
            return (
              <div key={m.id} className={`chat-row ${mine ? 'mine' : ''}`}>
                <span className="activity-stamp small" aria-hidden>
                  {mine ? '' : getStamp(partner?.avatarStamp).label}
                </span>
                <div className="chat-body">
                  <div className="chat-head">
                    <span className="activity-time">{relativeTime(m.createdAt)}</span>
                  </div>
                  <span className="chat-bubble">{m.content}</span>
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="dm-input-row">
        <textarea
          className="dm-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="メッセージを入力..."
          rows={1}
          maxLength={1000}
        />
        <button
          type="button"
          className="submit dm-send-btn"
          onClick={send}
          disabled={sending || !input.trim()}
        >
          送信
        </button>
      </div>
    </div>
  )
}
