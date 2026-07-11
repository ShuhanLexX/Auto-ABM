import '@testing-library/jest-dom'
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ImageGalleryModal } from './ImageGalleryModal'
import { useOverlayStore } from '../../stores/overlayStore'

const images = [{ src: 'data:image/png;base64,AAAA', name: 'a.png' }]

const reset = () => {
  useOverlayStore.setState(useOverlayStore.getInitialState(), true)
}

beforeEach(reset)
afterEach(reset)

describe('ImageGalleryModal · overlay suppression', () => {
  it('increments overlay count while open and decrements on unmount', () => {
    expect(useOverlayStore.getState().count).toBe(0)

    const { unmount } = render(
      <ImageGalleryModal
        open
        images={images}
        activeIndex={0}
        onClose={() => {}}
        onSelect={() => {}}
      />,
    )
    expect(useOverlayStore.getState().count).toBe(1)

    unmount()
    expect(useOverlayStore.getState().count).toBe(0)
  })

  it('does not increment when rendered with open=false', () => {
    const { unmount } = render(
      <ImageGalleryModal
        open={false}
        images={images}
        activeIndex={0}
        onClose={() => {}}
        onSelect={() => {}}
      />,
    )
    expect(useOverlayStore.getState().count).toBe(0)
    unmount()
    expect(useOverlayStore.getState().count).toBe(0)
  })

  it('toggles count when open prop flips closed → open → closed', () => {
    const { rerender, unmount } = render(
      <ImageGalleryModal
        open={false}
        images={images}
        activeIndex={0}
        onClose={() => {}}
        onSelect={() => {}}
      />,
    )
    expect(useOverlayStore.getState().count).toBe(0)

    rerender(
      <ImageGalleryModal
        open
        images={images}
        activeIndex={0}
        onClose={() => {}}
        onSelect={() => {}}
      />,
    )
    expect(useOverlayStore.getState().count).toBe(1)

    rerender(
      <ImageGalleryModal
        open={false}
        images={images}
        activeIndex={0}
        onClose={() => {}}
        onSelect={() => {}}
      />,
    )
    expect(useOverlayStore.getState().count).toBe(0)

    unmount()
    expect(useOverlayStore.getState().count).toBe(0)
  })
})
