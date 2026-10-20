import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { Box } from '@mantine/core'

interface WindowRect {
  x: number
  y: number
  width: number
  height: number
}

interface DragState {
  pointerId: number
  offsetX: number
  offsetY: number
}

const STORAGE_KEY = 'zd_preview_window_rect'

function defaultRect(): WindowRect {
  const viewportWidth = typeof window === 'undefined' ? 1440 : window.innerWidth
  const viewportHeight = typeof window === 'undefined' ? 900 : window.innerHeight
  const width = Math.min(620, Math.max(420, viewportWidth * 0.42))
  const height = Math.min(680, Math.max(420, viewportHeight - 112))
  return {
    x: Math.max(16, viewportWidth - width - 24),
    y: 72,
    width,
    height,
  }
}

function initialRect(): WindowRect {
  const fallback = defaultRect()
  if (typeof window === 'undefined') return fallback
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '') as Partial<WindowRect>
    if (![saved.x, saved.y, saved.width, saved.height].every(Number.isFinite)) return fallback
    const width = Math.min(Math.max(Number(saved.width), 380), window.innerWidth - 32)
    const height = Math.min(Math.max(Number(saved.height), 340), window.innerHeight - 72)
    return {
      x: Math.min(Math.max(Number(saved.x), 8), window.innerWidth - width - 8),
      y: Math.min(Math.max(Number(saved.y), 64), window.innerHeight - height - 8),
      width,
      height,
    }
  } catch {
    return fallback
  }
}

export function FloatingPreviewWindow({ children }: { children: ReactNode }) {
  const windowRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const [rect, setRect] = useState<WindowRect>(initialRect)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rect))
  }, [rect])

  useEffect(() => {
    const element = windowRef.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (dragRef.current) return
      const { width, height } = element.getBoundingClientRect()
      setRect((current) => {
        if (Math.abs(current.width - width) < 1 && Math.abs(current.height - height) < 1) return current
        return {
          ...current,
          x: Math.min(current.x, Math.max(8, window.innerWidth - width - 8)),
          y: Math.min(current.y, Math.max(64, window.innerHeight - height - 8)),
          width,
          height,
        }
      })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const clampToViewport = () => {
      setRect((current) => {
        const width = Math.min(current.width, window.innerWidth - 32)
        const height = Math.min(current.height, window.innerHeight - 72)
        return {
          x: Math.min(Math.max(current.x, 8), window.innerWidth - width - 8),
          y: Math.min(Math.max(current.y, 64), window.innerHeight - height - 8),
          width,
          height,
        }
      })
    }
    window.addEventListener('resize', clampToViewport)
    return () => window.removeEventListener('resize', clampToViewport)
  }, [])

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (!target.closest('[data-preview-drag-handle]') || target.closest('button, a, input')) return
    const bounds = event.currentTarget.getBoundingClientRect()
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const moveWindow = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = Math.min(Math.max(event.clientX - drag.offsetX, 8), window.innerWidth - bounds.width - 8)
    const y = Math.min(Math.max(event.clientY - drag.offsetY, 64), window.innerHeight - bounds.height - 8)
    setRect((current) => ({ ...current, x, y }))
  }

  const stopDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <Box
      ref={windowRef}
      onPointerDown={startDrag}
      onPointerMove={moveWindow}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      style={{
        position: 'fixed',
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        minWidth: 380,
        minHeight: 340,
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: 'calc(100vh - 72px)',
        resize: 'both',
        overflow: 'hidden',
        zIndex: 250,
        borderRadius: 'var(--mantine-radius-lg)',
        boxShadow: '0 24px 80px rgba(0, 0, 0, .28), 0 4px 18px rgba(0, 0, 0, .16)',
      }}
    >
      {children}
      <Box
        aria-hidden
        style={{
          position: 'absolute',
          right: 4,
          bottom: 4,
          width: 10,
          height: 10,
          borderRight: '2px solid var(--mantine-color-gray-5)',
          borderBottom: '2px solid var(--mantine-color-gray-5)',
          pointerEvents: 'none',
          opacity: 0.75,
        }}
      />
    </Box>
  )
}
