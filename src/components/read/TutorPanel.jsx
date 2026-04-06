import { useCallback, useEffect, useRef, useState } from 'react'

const TutorPanel = ({
  isOpen,
  onClose,
  language,
  nativeLanguage,
  storyText,
  initialMessage,
  storyId,
  anchorPos,
}) => {
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [size, setSize] = useState({ width: 380, height: null })
  const [animClass, setAnimClass] = useState('is-closed')
  const [transformOrigin, setTransformOrigin] = useState('bottom left')

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const dragRef = useRef(null)
  const resizeRef = useRef(null)
  const panelRef = useRef(null)
  const lastInitialMessageRef = useRef(null)
  const hasPositionedRef = useRef(false)

  // Reset conversation on story change
  useEffect(() => {
    setMessages([])
    lastInitialMessageRef.current = null
  }, [storyId])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && !initialMessage) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen, initialMessage])

  // Animate open/close and position in margin
  useEffect(() => {
    if (isOpen) {
      if (!hasPositionedRef.current) {
        hasPositionedRef.current = true

        let panelW = size.width || 380
        const panelH = 400
        const gap = 32

        // Find the text column edges
        const col = document.querySelector('.reader-content-column')
        const colRect = col?.getBoundingClientRect()

        // Determine fab center
        const fabX = anchorPos?.x != null ? anchorPos.x + 20 : 44
        const fabY = anchorPos?.y != null ? anchorPos.y + 20 : window.innerHeight - 44

        let x, y

        if (colRect) {
          const rightMargin = window.innerWidth - colRect.right
          const leftMargin = colRect.left

          if (fabX > window.innerWidth / 2) {
            // Tab on right — open in right margin
            const availableW = rightMargin - gap - 8
            if (availableW >= 280) {
              x = colRect.right + gap
              panelW = Math.min(panelW, availableW)
            } else {
              // Right margin too narrow, use left
              const leftAvailable = leftMargin - gap - 8
              panelW = Math.min(panelW, Math.max(280, leftAvailable))
              x = colRect.left - panelW - gap
              if (x < 8) x = 8
            }
          } else {
            // Tab on left — open in left margin
            const availableW = leftMargin - gap - 8
            if (availableW >= 280) {
              panelW = Math.min(panelW, availableW)
              x = colRect.left - panelW - gap
              if (x < 8) x = 8
            } else {
              // Left margin too narrow, use right
              const rightAvailable = rightMargin - gap - 8
              panelW = Math.min(panelW, Math.max(280, rightAvailable))
              x = colRect.right + gap
            }
          }
        } else {
          // No column found — fallback
          x = fabX > window.innerWidth / 2
            ? Math.max(8, window.innerWidth - panelW - 8)
            : 8
        }

        // Vertical: align with fab, clamped to viewport
        y = Math.max(8, Math.min(fabY - panelH / 2, window.innerHeight - panelH - 8))

        // Transform origin relative to panel
        const originX = fabX - x
        const originY = fabY - y
        setTransformOrigin(`${originX}px ${originY}px`)

        setPosition({ x, y })
        if (panelW !== (size.width || 380)) {
          setSize((prev) => ({ ...prev, width: panelW }))
        }
      }

      // Trigger open animation on next frame
      requestAnimationFrame(() => {
        setAnimClass('is-open')
      })
    } else {
      setAnimClass('is-closed')
      hasPositionedRef.current = false
    }
  }, [isOpen, anchorPos, size.width])

  const sendMessage = useCallback(async (content) => {
    if (!content.trim() || isLoading) return

    const userMsg = { role: 'user', content: content.trim() }
    setMessages((prev) => [...prev, userMsg])
    setIsLoading(true)

    try {
      const response = await fetch('http://localhost:4000/api/reader/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content.trim(),
          targetLanguage: language,
          sourceLanguage: nativeLanguage,
          conversationHistory: [...messages, userMsg],
          storyText,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setMessages((prev) => [...prev, { role: 'assistant', content: data.response }])
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: 'Sorry, I could not respond. Please try again.' }])
      }
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Connection error. Please try again.' }])
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, language, nativeLanguage, messages, storyText])

  // Auto-send initial message from "Ask tutor" button
  useEffect(() => {
    if (initialMessage && initialMessage !== lastInitialMessageRef.current) {
      lastInitialMessageRef.current = initialMessage
      sendMessage(initialMessage)
    }
  }, [initialMessage, sendMessage])

  const handleSend = () => {
    if (!inputValue.trim()) return
    sendMessage(inputValue)
    setInputValue('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'Escape') {
      onClose()
    }
  }

  // Dragging
  const startDrag = (e) => {
    if (e.target.closest('button')) return
    e.preventDefault()
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: position.x,
      originY: position.y,
      rafId: null,
      lastX: position.x,
      lastY: position.y,
    }

    const onMove = (ev) => {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      const newX = Math.max(0, Math.min(window.innerWidth - 380, dragRef.current.originX + dx))
      const newY = Math.max(0, Math.min(window.innerHeight - 100, dragRef.current.originY + dy))
      dragRef.current.lastX = newX
      dragRef.current.lastY = newY
      if (dragRef.current.rafId) cancelAnimationFrame(dragRef.current.rafId)
      dragRef.current.rafId = requestAnimationFrame(() => {
        if (panelRef.current) {
          panelRef.current.style.left = `${newX}px`
          panelRef.current.style.top = `${newY}px`
        }
      })
    }

    const onUp = () => {
      const finalX = dragRef.current?.lastX ?? position.x
      const finalY = dragRef.current?.lastY ?? position.y
      if (dragRef.current?.rafId) cancelAnimationFrame(dragRef.current.rafId)
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setPosition({ x: finalX, y: finalY })
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const startResize = (dir) => (e) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = panelRef.current?.getBoundingClientRect()
    if (!rect) return

    const resizeLeft = dir.includes('l')
    const resizeRight = dir.includes('r')
    const resizeTop = dir.includes('t')
    const resizeBottom = dir.includes('b')

    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originW: rect.width,
      originH: rect.height,
      originX: rect.left,
      originY: rect.top,
      rafId: null,
      lastW: rect.width,
      lastH: rect.height,
      lastX: rect.left,
      lastY: rect.top,
    }

    const onMove = (ev) => {
      if (!resizeRef.current) return
      const dx = ev.clientX - resizeRef.current.startX
      const dy = ev.clientY - resizeRef.current.startY
      let newW = resizeRef.current.originW
      let newH = resizeRef.current.originH
      let newX = resizeRef.current.originX
      let newY = resizeRef.current.originY

      if (resizeRight) newW = Math.max(280, resizeRef.current.originW + dx)
      if (resizeLeft) {
        newW = Math.max(280, resizeRef.current.originW - dx)
        newX = resizeRef.current.originX + (resizeRef.current.originW - newW)
      }
      if (resizeBottom) newH = Math.max(200, resizeRef.current.originH + dy)
      if (resizeTop) {
        newH = Math.max(200, resizeRef.current.originH - dy)
        newY = resizeRef.current.originY + (resizeRef.current.originH - newH)
      }

      resizeRef.current.lastW = newW
      resizeRef.current.lastH = newH
      resizeRef.current.lastX = newX
      resizeRef.current.lastY = newY
      if (resizeRef.current.rafId) cancelAnimationFrame(resizeRef.current.rafId)
      resizeRef.current.rafId = requestAnimationFrame(() => {
        if (panelRef.current) {
          panelRef.current.style.width = `${newW}px`
          panelRef.current.style.height = `${newH}px`
          panelRef.current.style.maxHeight = `${newH}px`
          panelRef.current.style.left = `${newX}px`
          panelRef.current.style.top = `${newY}px`
        }
      })
    }

    const onUp = () => {
      const finalW = resizeRef.current?.lastW ?? size.width
      const finalH = resizeRef.current?.lastH ?? size.height
      const finalX = resizeRef.current?.lastX ?? position.x
      const finalY = resizeRef.current?.lastY ?? position.y
      if (resizeRef.current?.rafId) cancelAnimationFrame(resizeRef.current.rafId)
      resizeRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setSize({ width: finalW, height: finalH })
      setPosition({ x: finalX, y: finalY })
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      ref={panelRef}
      className={`tutor-panel ${animClass}`}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: size.width,
        transformOrigin,
        ...(size.height ? { height: size.height, maxHeight: size.height } : {}),
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="tutor-panel-titlebar" onMouseDown={startDrag}>
        <span className="tutor-panel-title">AI Tutor</span>
        <div className="tutor-panel-titlebar-actions">
          <button
            type="button"
            className="tutor-panel-btn"
            onClick={() => {
              setMessages([])
              lastInitialMessageRef.current = null
            }}
            title="Clear conversation"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
          <button
            type="button"
            className="tutor-panel-btn"
            onClick={onClose}
            title="Close"
          >
            &times;
          </button>
        </div>
      </div>

      <div className="tutor-panel-messages">
        {messages.length === 0 && !isLoading && (
          <div className="tutor-panel-empty">
            Ask anything about the story — grammar, vocabulary, conjugation, cultural context...
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`tutor-msg tutor-msg--${msg.role}`}>
            {msg.content}
          </div>
        ))}
        {isLoading && (
          <div className="tutor-msg tutor-msg--assistant tutor-msg--loading">...</div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="tutor-panel-input-row">
        <input
          ref={inputRef}
          className="tutor-panel-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about this text..."
          disabled={isLoading}
        />
        <button
          type="button"
          className="tutor-panel-send"
          onClick={handleSend}
          disabled={isLoading || !inputValue.trim()}
          aria-label="Send message"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
      <div className="tutor-resize tutor-resize--t" onMouseDown={startResize('t')} />
      <div className="tutor-resize tutor-resize--r" onMouseDown={startResize('r')} />
      <div className="tutor-resize tutor-resize--b" onMouseDown={startResize('b')} />
      <div className="tutor-resize tutor-resize--l" onMouseDown={startResize('l')} />
      <div className="tutor-resize tutor-resize--tl" onMouseDown={startResize('tl')} />
      <div className="tutor-resize tutor-resize--tr" onMouseDown={startResize('tr')} />
      <div className="tutor-resize tutor-resize--bl" onMouseDown={startResize('bl')} />
      <div className="tutor-resize tutor-resize--br" onMouseDown={startResize('br')} />
    </div>
  )
}

export default TutorPanel
