import { useCallback, useEffect, useRef, useState } from 'react'

const MIN_WIDTH = 320
const MIN_HEIGHT = 280
const MAX_WIDTH_RATIO = 0.9
const MAX_HEIGHT_RATIO = 0.9
const MIN_VISIBLE_PX = 50
const HEADER_CLEARANCE = 118 // leave room for the cinema header + a little extra
const BOTTOM_CLEARANCE = 68
// Right-side gap. A bit larger than BOTTOM_CLEARANCE because the iframe
// letterboxing adds apparent space at the bottom; tuned by eye so the
// right gap reads comparable to the bottom gap.
const EDGE_PADDING = 18

// Derive default size from the viewport: tall enough to show plenty of
// transcript but still clear of the header / viewport edge, and narrow
// enough not to overwhelm the video.
const computeDefaultBounds = () => {
  const width = Math.max(MIN_WIDTH, Math.min(450, Math.round(window.innerWidth * 0.28)))
  const height = Math.max(
    MIN_HEIGHT,
    Math.round(window.innerHeight - HEADER_CLEARANCE - BOTTOM_CLEARANCE)
  )
  return { width, height }
}

// Map resize direction to cursor style
const CURSOR_MAP = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
}

const FloatingTranscriptPanel = ({ children, isOpen, onClose }) => {
  const panelRef = useRef(null)
  // Combined state to prevent micro-jitter
  const [bounds, setBounds] = useState(() => {
    const { width, height } = computeDefaultBounds()
    return { x: null, y: null, width, height }
  })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [resizeDirection, setResizeDirection] = useState(null)
  const [isMinimized, setIsMinimized] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 })
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 })
  // Flips true once the user drags or resizes. While false the panel re-lays
  // itself out on every viewport change so the design proportions match the
  // current browser size. Once true, we respect the user's placement and only
  // clamp on viewport change.
  const hasUserCustomisedRef = useRef(false)

  // Slide-in / slide-out animation. The panel stays mounted during the
  // exit animation and unmounts after the transition completes.
  //   'closed'   → unmounted (return null)
  //   'entering' → mounted, off-screen right (start frame)
  //   'open'     → mounted, in final position (slid in)
  //   'exiting'  → mounted, animating back off-screen right
  const [animState, setAnimState] = useState('closed')
  const exitTimeoutRef = useRef(null)
  useEffect(() => {
    if (isOpen) {
      if (exitTimeoutRef.current) {
        clearTimeout(exitTimeoutRef.current)
        exitTimeoutRef.current = null
      }
      setAnimState('entering')
      // Two RAFs so the browser paints the off-screen frame before
      // switching to the in-view frame — otherwise the transition
      // doesn't play on first open.
      const raf1 = requestAnimationFrame(() => {
        const raf2 = requestAnimationFrame(() => setAnimState('open'))
        exitTimeoutRef.current = raf2
      })
      return () => cancelAnimationFrame(raf1)
    }
    if (animState === 'closed') return undefined
    setAnimState('exiting')
    exitTimeoutRef.current = setTimeout(() => {
      setAnimState('closed')
      exitTimeoutRef.current = null
    }, 320)
    return undefined
  }, [isOpen])

  useEffect(() => () => {
    if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current)
  }, [])

  // Clamp position to keep panel visible on screen
  const clampPosition = useCallback((x, y, width, height) => {
    const maxX = window.innerWidth - MIN_VISIBLE_PX
    const maxY = window.innerHeight - MIN_VISIBLE_PX
    const minX = MIN_VISIBLE_PX - width
    const minY = 0 // Don't allow hiding above viewport

    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    }
  }, [])

  // Compute the design-tuned default bounds from the live viewport and apply
  // them. Used on first open, on viewport / fullscreen change (while not
  // customised), and on double-click reset.
  const applyDefaultBounds = useCallback(() => {
    const { width, height } = computeDefaultBounds()
    setBounds({
      x: window.innerWidth - width - EDGE_PADDING,
      y: HEADER_CLEARANCE,
      width,
      height,
    })
  }, [])

  // Initialize on first open
  useEffect(() => {
    if (isOpen && bounds.x === null) {
      applyDefaultBounds()
    }
  }, [isOpen, bounds.x, applyDefaultBounds])

  // React to viewport changes (window resize + fullscreen enter/exit).
  // Not yet customised → re-lay out to the design proportions.
  // Customised → just clamp so the panel doesn't slip off-screen.
  useEffect(() => {
    const handleViewportChange = () => {
      if (!hasUserCustomisedRef.current) {
        setBounds((prev) => {
          if (prev.x === null) return prev
          const { width, height } = computeDefaultBounds()
          return {
            x: window.innerWidth - width - EDGE_PADDING,
            y: HEADER_CLEARANCE,
            width,
            height,
          }
        })
        return
      }
      setBounds((prev) => {
        if (prev.x === null) return prev
        const clamped = clampPosition(prev.x, prev.y, prev.width, prev.height)
        return { ...prev, ...clamped }
      })
    }

    window.addEventListener('resize', handleViewportChange)
    document.addEventListener('fullscreenchange', handleViewportChange)
    return () => {
      window.removeEventListener('resize', handleViewportChange)
      document.removeEventListener('fullscreenchange', handleViewportChange)
    }
  }, [clampPosition])

  // Reset position + size on double-click header
  const handleHeaderDoubleClick = useCallback(() => {
    hasUserCustomisedRef.current = false
    applyDefaultBounds()
  }, [applyDefaultBounds])

  // Handle drag start (pointer events for mouse + touch)
  const handleDragStart = useCallback((e) => {
    // Don't start drag if clicking on buttons or resize handles
    if (e.target.closest('button') || e.target.closest('.floating-panel-resize-handle')) return
    e.preventDefault()
    e.target.setPointerCapture(e.pointerId)
    hasUserCustomisedRef.current = true
    setIsDragging(true)
    setBounds((prev) => {
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        posX: prev.x,
        posY: prev.y,
      }
      return prev
    })
  }, [])

  // Handle resize start (pointer events for mouse + touch)
  const handleResizeStart = useCallback((e, direction) => {
    e.preventDefault()
    e.stopPropagation()
    e.target.setPointerCapture(e.pointerId)
    hasUserCustomisedRef.current = true
    setIsResizing(true)
    setResizeDirection(direction)
    setBounds((prev) => {
      resizeStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        width: prev.width,
        height: prev.height,
        posX: prev.x,
        posY: prev.y,
      }
      return prev
    })
  }, [])

  // Handle pointer move for drag and resize
  useEffect(() => {
    if (!isDragging && !isResizing) return

    const maxWidth = window.innerWidth * MAX_WIDTH_RATIO
    const maxHeight = window.innerHeight * MAX_HEIGHT_RATIO

    const handlePointerMove = (e) => {
      if (isDragging) {
        const deltaX = e.clientX - dragStartRef.current.x
        const deltaY = e.clientY - dragStartRef.current.y
        const newX = dragStartRef.current.posX + deltaX
        const newY = dragStartRef.current.posY + deltaY

        setBounds((prev) => {
          const clamped = clampPosition(newX, newY, prev.width, prev.height)
          return { ...prev, x: clamped.x, y: clamped.y }
        })
      } else if (isResizing && resizeDirection) {
        const deltaX = e.clientX - resizeStartRef.current.x
        const deltaY = e.clientY - resizeStartRef.current.y
        const { width: startWidth, height: startHeight, posX, posY } = resizeStartRef.current

        let newWidth = startWidth
        let newHeight = startHeight
        let newX = posX
        let newY = posY

        // Handle different resize directions with max constraints
        if (resizeDirection.includes('e')) {
          newWidth = Math.min(maxWidth, Math.max(MIN_WIDTH, startWidth + deltaX))
        }
        if (resizeDirection.includes('w')) {
          const potentialWidth = startWidth - deltaX
          if (potentialWidth >= MIN_WIDTH && potentialWidth <= maxWidth) {
            newWidth = potentialWidth
            newX = posX + deltaX
          }
        }
        if (resizeDirection.includes('s')) {
          newHeight = Math.min(maxHeight, Math.max(MIN_HEIGHT, startHeight + deltaY))
        }
        if (resizeDirection.includes('n')) {
          const potentialHeight = startHeight - deltaY
          if (potentialHeight >= MIN_HEIGHT && potentialHeight <= maxHeight) {
            newHeight = potentialHeight
            newY = posY + deltaY
          }
        }

        const clamped = clampPosition(newX, newY, newWidth, newHeight)
        setBounds({ x: clamped.x, y: clamped.y, width: newWidth, height: newHeight })
      }
    }

    const handlePointerUp = () => {
      setIsDragging(false)
      setIsResizing(false)
      setResizeDirection(null)
    }

    // Add listeners to document to capture pointer events outside panel
    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)

    // Add class to body to prevent text selection while dragging/resizing
    document.body.style.userSelect = 'none'
    document.body.style.cursor = isDragging ? 'grabbing' : CURSOR_MAP[resizeDirection] || 'nwse-resize'

    return () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [isDragging, isResizing, resizeDirection, clampPosition])

  if (animState === 'closed') return null

  if (isMinimized) {
    return (
      <div
        className="floating-panel-minimized is-dark"
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

  return (
    <div
      ref={panelRef}
      className={`floating-transcript-panel floating-transcript-panel--${animState} is-dark ${isDragging ? 'is-dragging' : ''} ${isResizing ? 'is-resizing' : ''}`}
      style={{
        position: 'fixed',
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
        zIndex: 1000,
        touchAction: 'none', // Prevent browser touch gestures during drag/resize
      }}
    >
      {/* Drag handle / header */}
      <div
        className="floating-panel-header"
        onPointerDown={handleDragStart}
        onDoubleClick={handleHeaderDoubleClick}
      >
        <div className="floating-panel-drag-area" />
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

      {/* Resize handles - larger hit areas */}
      <div
        className="floating-panel-resize-handle floating-panel-resize-n"
        onPointerDown={(e) => handleResizeStart(e, 'n')}
      />
      <div
        className="floating-panel-resize-handle floating-panel-resize-s"
        onPointerDown={(e) => handleResizeStart(e, 's')}
      />
      <div
        className="floating-panel-resize-handle floating-panel-resize-e"
        onPointerDown={(e) => handleResizeStart(e, 'e')}
      />
      <div
        className="floating-panel-resize-handle floating-panel-resize-w"
        onPointerDown={(e) => handleResizeStart(e, 'w')}
      />
      <div
        className="floating-panel-resize-handle floating-panel-resize-ne"
        onPointerDown={(e) => handleResizeStart(e, 'ne')}
      />
      <div
        className="floating-panel-resize-handle floating-panel-resize-nw"
        onPointerDown={(e) => handleResizeStart(e, 'nw')}
      />
      <div
        className="floating-panel-resize-handle floating-panel-resize-se"
        onPointerDown={(e) => handleResizeStart(e, 'se')}
      />
      <div
        className="floating-panel-resize-handle floating-panel-resize-sw"
        onPointerDown={(e) => handleResizeStart(e, 'sw')}
      />
    </div>
  )
}

export default FloatingTranscriptPanel
