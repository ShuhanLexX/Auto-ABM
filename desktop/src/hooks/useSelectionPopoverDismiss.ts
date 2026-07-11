import { useEffect } from 'react'

type ElementRef = {
  current: HTMLElement | null
}

const VIEWPORT_MARGIN = 12

type SelectionRect = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

type SelectionGeometry = {
  rect: SelectionRect | DOMRect
  isMultiLine: boolean
}

function clampValue(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
}

function isUsableRect(rect: SelectionRect | DOMRect) {
  return rect.width > 0 || rect.height > 0
}

function getRangeSelectionGeometry(range: Range): SelectionGeometry | null {
  const clientRects = typeof range.getClientRects === 'function'
    ? Array.from(range.getClientRects()).filter(isUsableRect)
    : []
  const boundingRect = typeof range.getBoundingClientRect === 'function'
    ? range.getBoundingClientRect()
    : null

  if (clientRects.length > 0) {
    const left = Math.min(...clientRects.map((rect) => rect.left))
    const top = Math.min(...clientRects.map((rect) => rect.top))
    const right = Math.max(...clientRects.map((rect) => rect.right))
    const bottom = Math.max(...clientRects.map((rect) => rect.bottom))
    const unionRect = {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
    }
    const maxLineHeight = Math.max(...clientRects.map((rect) => rect.height))
    return {
      rect: boundingRect && isUsableRect(boundingRect) ? boundingRect : unionRect,
      isMultiLine: clientRects.length > 1 || unionRect.height > maxLineHeight * 1.6,
    }
  }

  if (boundingRect && isUsableRect(boundingRect)) {
    return {
      rect: boundingRect,
      isMultiLine: boundingRect.height > 32,
    }
  }

  return null
}

export function clearWindowSelection() {
  window.getSelection()?.removeAllRanges()
}

export function getSelectionPopoverPosition(
  range: Range,
  root: HTMLElement,
  {
    menuWidth,
    menuHeight,
    offset,
    fallbackPointer,
  }: {
    menuWidth: number
    menuHeight: number
    offset: number
    fallbackPointer?: { clientX: number; clientY: number }
  },
) {
  const geometry = getRangeSelectionGeometry(range)
  const rootRect = root.getBoundingClientRect()
  const pointerInsideRoot = fallbackPointer
    && fallbackPointer.clientX >= rootRect.left
    && fallbackPointer.clientX <= rootRect.right
    && fallbackPointer.clientY >= rootRect.top
    && fallbackPointer.clientY <= rootRect.bottom
  const fallbackX = pointerInsideRoot ? fallbackPointer.clientX : rootRect.left + 24
  const fallbackY = pointerInsideRoot ? fallbackPointer.clientY : rootRect.top + 24
  const selectionRect = geometry?.rect ?? {
    left: fallbackX,
    top: fallbackY,
    right: fallbackX,
    bottom: fallbackY,
    width: 0,
    height: 0,
  }
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || rootRect.right + VIEWPORT_MARGIN
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || rootRect.bottom + VIEWPORT_MARGIN
  const minX = VIEWPORT_MARGIN
  const maxX = Math.max(minX, viewportWidth - menuWidth - VIEWPORT_MARGIN)
  const minY = VIEWPORT_MARGIN
  const maxY = Math.max(minY, viewportHeight - menuHeight - VIEWPORT_MARGIN)
  const clampPosition = (position: { x: number; y: number }) => ({
    x: clampValue(position.x, minX, maxX),
    y: clampValue(position.y, minY, maxY),
  })
  const centerX = selectionRect.left + selectionRect.width / 2
  const centerY = selectionRect.top + selectionRect.height / 2
  const above = {
    x: centerX - menuWidth / 2,
    y: selectionRect.top - menuHeight - offset,
  }

  const right = {
    x: selectionRect.right + offset,
    y: centerY - menuHeight / 2,
  }
  if (geometry?.isMultiLine && right.x + menuWidth <= viewportWidth - VIEWPORT_MARGIN) return clampPosition(right)

  if (above.y >= VIEWPORT_MARGIN) return clampPosition(above)

  if (right.x + menuWidth <= viewportWidth - VIEWPORT_MARGIN) return clampPosition(right)

  const below = {
    x: centerX - menuWidth / 2,
    y: selectionRect.bottom + offset,
  }
  if (below.y + menuHeight <= viewportHeight - VIEWPORT_MARGIN) return clampPosition(below)

  return clampPosition(above)
}

export function useSelectionPopoverDismiss({
  active,
  popoverRef,
  onDismiss,
}: {
  active: boolean
  popoverRef: ElementRef
  onDismiss: () => void
}) {
  useEffect(() => {
    if (!active) return

    const dismiss = () => {
      onDismiss()
      clearWindowSelection()
    }

    const handlePointerDown = (event: PointerEvent) => {
      const popover = popoverRef.current
      const target = event.target
      if (popover && target instanceof Node && popover.contains(target)) {
        return
      }

      dismiss()
    }

    const handleScroll = () => {
      dismiss()
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('scroll', handleScroll, true)
    }
  }, [active, onDismiss, popoverRef])
}
