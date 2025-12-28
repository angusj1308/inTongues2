import { cloneElement, useCallback, useEffect, useRef, useState } from 'react'

const MIN_WIDTH = 320
const MIN_HEIGHT = 280
const DEFAULT_WIDTH = 480
const DEFAULT_HEIGHT = 520

const FloatingTranscriptPanel = ({ children, isOpen, onClose }) => {
  const panelRef = useRef(null)
  const [position, setPosition] = useState({ x: null, y: null })
  const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [resizeDirection, setResizeDirection] = useState(null)
  const [isMinimized, setIsMinimized] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(true) // Default dark in cinema
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 })
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 })

  // Initialize position on first open (bottom-right corner)
  useEffect(() => {
    if (isOpen && position.x === null) {
      const padding = 24
      setPosition({
        x: window.innerWidth - DEFAULT_WIDTH - padding,
        y: window.innerHeight - DEFAULT_HEIGHT - padding - 60,
      })
    }
  }, [isOpen, position.x])

  // Handle drag start
  const handleDragStart = useCallback((e) => {
    // Don't start drag if clicking on buttons or resize handles
    if (e.target.closest('button') || e.target.closest('.floating-panel-resize-handle')) return
    e.preventDefault()
    setIsDragging(true)
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
    }
  }, [position])

  // Handle resize start
  const handleResizeStart = useCallback((e, direction) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
    setResizeDirection(direction)
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
      posX: position.x,
      posY: position.y,
    }
  }, [size, position])

  // Handle mouse move for drag and resize
  useEffect(() => {
    if (!isDragging && !isResizing) return

    const handleMouseMove = (e) => {
      if (isDragging) {
        const deltaX = e.clientX - dragStartRef.current.x
        const deltaY = e.clientY - dragStartRef.current.y
        setPosition({
          x: dragStartRef.current.posX + deltaX,
          y: dragStartRef.current.posY + deltaY,
        })
      } else if (isResizing && resizeDirection) {
        const deltaX = e.clientX - resizeStartRef.current.x
        const deltaY = e.clientY - resizeStartRef.current.y
        const { width: startWidth, height: startHeight, posX, posY } = resizeStartRef.current

        let newWidth = startWidth
        let newHeight = startHeight
        let newX = posX
        let newY = posY

        // Handle different resize directions
        if (resizeDirection.includes('e')) {
          newWidth = Math.max(MIN_WIDTH, startWidth + deltaX)
        }
        if (resizeDirection.includes('w')) {
          const potentialWidth = startWidth - deltaX
          if (potentialWidth >= MIN_WIDTH) {
            newWidth = potentialWidth
            newX = posX + deltaX
          }
        }
        if (resizeDirection.includes('s')) {
          newHeight = Math.max(MIN_HEIGHT, startHeight + deltaY)
        }
        if (resizeDirection.includes('n')) {
          const potentialHeight = startHeight - deltaY
          if (potentialHeight >= MIN_HEIGHT) {
            newHeight = potentialHeight
            newY = posY + deltaY
          }
        }

        setSize({ width: newWidth, height: newHeight })
        setPosition({ x: newX, y: newY })
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      setIsResizing(false)
      setResizeDirection(null)
    }

    // Add listeners to document to capture mouse events outside panel
    document.addEventListener('mousemove', handleMouseMove, { passive: true })
    document.addEventListener('mouseup', handleMouseUp)

    // Add class to body to prevent text selection while dragging/resizing
    document.body.style.userSelect = 'none'
    document.body.style.cursor = isDragging ? 'grabbing' : 'nwse-resize'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [isDragging, isResizing, resizeDirection])

  if (!isOpen) return null

  if (isMinimized) {
    return (
      <div
        className="floating-panel-minimized"
        style={{
          position: 'fixed',
          right: 20,
          bottom: 20,
          zIndex: 1000,
        }}
      >
        <button
          type="button"
          className="floating-panel-restore-btn"
          onClick={() => setIsMinimized(false)}
          title="Restore transcript"
        >
          <span className="material-symbols-outlined">description</span>
        </button>
      </div>
    )
  }

  // Clone children to pass darkMode prop
  const childrenWithProps = cloneElement(children, { darkMode: isDarkMode })

  return (
    <div
      ref={panelRef}
      className={`floating-transcript-panel ${isDarkMode ? 'is-dark' : 'is-light'} ${isDragging ? 'is-dragging' : ''} ${isResizing ? 'is-resizing' : ''}`}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        zIndex: 1000,
      }}
    >
      {/* Drag handle / header */}
      <div
        className="floating-panel-header"
        onMouseDown={handleDragStart}
      >
        <div className="floating-panel-drag-area" />
        <div className="floating-panel-controls">
          <button
            type="button"
            className="floating-panel-btn"
            onClick={() => setIsDarkMode(!isDarkMode)}
            title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <span className="material-symbols-outlined">
              {isDarkMode ? 'light_mode' : 'dark_mode'}
            </span>
          </button>
          <button
            type="button"
            className="floating-panel-btn"
            onClick={() => setIsMinimized(true)}
            title="Minimize"
          >
            <span className="material-symbols-outlined">minimize</span>
          </button>
          <button
            type="button"
            className="floating-panel-btn"
            onClick={onClose}
            title="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="floating-panel-content">
        {childrenWithProps}
      </div>

      {/* Resize handles - larger hit areas */}
      <div
        className="floating-panel-resize-handle floating-panel-resize-n"
        onMouseDown={(e) => handleResizeStart(e, 'n')}
      />
      <div
        className="floating-panel-resize-handle floating-panel-resize-s"
        onMouseDown={(e) => handleResizeStart(e, 's')}
      />
      <div
        className="floating-panel-resize-handle floating-panel-resize-e"
        onMouseDown={(e) => handleResizeStart(e, 'e')}
      />
      <div
        className="floating-panel-resize-handle floating-panel-resize-w"
        onMouseDown={(e) => handleResizeStart(e, 'w')}
      />
      <div
        className="floating-panel-resize-handle floating-panel-resize-ne"
        onMouseDown={(e) => handleResizeStart(e, 'ne')}
      />
      <div
        className="floating-panel-resize-handle floating-panel-resize-nw"
        onMouseDown={(e) => handleResizeStart(e, 'nw')}
      />
      <div
        className="floating-panel-resize-handle floating-panel-resize-se"
        onMouseDown={(e) => handleResizeStart(e, 'se')}
      />
      <div
        className="floating-panel-resize-handle floating-panel-resize-sw"
        onMouseDown={(e) => handleResizeStart(e, 'sw')}
      />
    </div>
  )
}

export default FloatingTranscriptPanel
