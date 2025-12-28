import { useCallback, useEffect, useRef, useState } from 'react'

const MIN_WIDTH = 280
const MIN_HEIGHT = 200
const DEFAULT_WIDTH = 380
const DEFAULT_HEIGHT = 400

const FloatingTranscriptPanel = ({ children, isOpen, onClose }) => {
  const panelRef = useRef(null)
  const [position, setPosition] = useState({ x: null, y: null })
  const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [resizeDirection, setResizeDirection] = useState(null)
  const [isMinimized, setIsMinimized] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 })
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 })

  // Initialize position on first open (bottom-right corner)
  useEffect(() => {
    if (isOpen && position.x === null) {
      const padding = 20
      setPosition({
        x: window.innerWidth - DEFAULT_WIDTH - padding,
        y: window.innerHeight - DEFAULT_HEIGHT - padding - 60, // Account for header
      })
    }
  }, [isOpen, position.x])

  // Handle drag start
  const handleDragStart = useCallback((e) => {
    if (e.target.closest('.floating-panel-resize-handle')) return
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
    const handleMouseMove = (e) => {
      if (isDragging) {
        const deltaX = e.clientX - dragStartRef.current.x
        const deltaY = e.clientY - dragStartRef.current.y
        setPosition({
          x: dragStartRef.current.posX + deltaX,
          y: dragStartRef.current.posY + deltaY,
        })
      } else if (isResizing) {
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

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
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
          <span>Transcript</span>
        </button>
      </div>
    )
  }

  return (
    <div
      ref={panelRef}
      className={`floating-transcript-panel ${isDragging ? 'is-dragging' : ''} ${isResizing ? 'is-resizing' : ''}`}
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
        <span className="floating-panel-title">Transcript</span>
        <div className="floating-panel-controls">
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
        {children}
      </div>

      {/* Resize handles */}
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
