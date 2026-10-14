import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openCheckoutModal, openCheckoutPopup, WarpCheckoutError } from '@usewarp/js'
import { useWarpCheckout } from '../src'
import { CHECKOUT_URL, SESSION_ID, calls, flush } from './mockWarpJs'

vi.mock('@usewarp/js', async () => (await import('./mockWarpJs')).createWarpJsMock())

const modal = vi.mocked(openCheckoutModal)
const popup = vi.mocked(openCheckoutPopup)

beforeEach(() => {
  calls.reset()
  modal.mockClear()
  popup.mockClear()
})

afterEach(() => {
  cleanup()
})

describe('useWarpCheckout', () => {
  it('starts closed', () => {
    const { result } = renderHook(() => useWarpCheckout({ checkoutUrl: CHECKOUT_URL }))
    expect(result.current).toMatchObject({ isOpen: false, isLoading: false, status: null, sessionId: null, error: null })
  })

  it('opens a modal and tracks status and session id', async () => {
    const onStatus = vi.fn()
    const { result } = renderHook(() => useWarpCheckout({ checkoutUrl: CHECKOUT_URL, theme: 'light', onStatus }))

    let opened!: Promise<void>
    act(() => {
      opened = result.current.openModal()
    })
    expect(modal).toHaveBeenCalledTimes(1)
    expect(modal.mock.calls[0]![0]).toMatchObject({ checkoutUrl: CHECKOUT_URL, theme: 'light' })
    expect(result.current).toMatchObject({ isOpen: true, isLoading: true })

    await act(async () => {
      await opened
    })
    expect(result.current).toMatchObject({ isOpen: true, isLoading: false, sessionId: SESSION_ID })

    act(() => calls.modal[0]!.options.onStatus?.('processing'))
    expect(result.current.status).toBe('processing')
    expect(onStatus).toHaveBeenCalledWith('processing')
  })

  it('closes when the customer cancels or returns', async () => {
    const onCancel = vi.fn()
    const onReturn = vi.fn()
    const { result } = renderHook(() => useWarpCheckout({ checkoutUrl: CHECKOUT_URL, onCancel, onReturn }))

    await act(() => result.current.openModal())
    act(() => calls.modal[0]!.options.onCancel?.())
    expect(result.current.isOpen).toBe(false)
    expect(onCancel).toHaveBeenCalledTimes(1)

    await act(() => result.current.openModal())
    act(() => {
      calls.modal[1]!.options.onStatus?.('completed')
      calls.modal[1]!.options.onReturn?.()
    })
    expect(result.current).toMatchObject({ isOpen: false, status: 'completed' })
    expect(onReturn).toHaveBeenCalledTimes(1)
  })

  it('close() destroys the open checkout', async () => {
    const { result } = renderHook(() => useWarpCheckout({ checkoutUrl: CHECKOUT_URL }))
    await act(() => result.current.openModal())
    act(() => result.current.close())

    expect(calls.modal[0]!.destroy).toHaveBeenCalledTimes(1)
    expect(result.current.isOpen).toBe(false)
  })

  it('opening again replaces the previous checkout', async () => {
    const { result } = renderHook(() => useWarpCheckout({ checkoutUrl: CHECKOUT_URL }))
    await act(() => result.current.openModal())
    await act(() => result.current.openPopup())

    expect(calls.modal[0]!.destroy).toHaveBeenCalledTimes(1)
    expect(calls.popup).toHaveLength(1)
    expect(result.current.isOpen).toBe(true)
  })

  it('calls openCheckoutPopup synchronously so the popup keeps the user gesture', () => {
    const fetchCheckoutUrl = vi.fn(async () => CHECKOUT_URL)
    const { result } = renderHook(() => useWarpCheckout({ fetchCheckoutUrl }))

    act(() => {
      void result.current.openPopup()
      expect(popup).toHaveBeenCalledTimes(1)
    })
  })

  it('uses the latest options and callbacks without changing function identity', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const { result, rerender } = renderHook((props: { onStatus: () => void }) => useWarpCheckout({ checkoutUrl: CHECKOUT_URL, ...props }), {
      initialProps: { onStatus: first },
    })
    const { openModal } = result.current
    rerender({ onStatus: second })
    expect(result.current.openModal).toBe(openModal)

    await act(() => result.current.openModal())
    act(() => calls.modal[0]!.options.onStatus?.('pending'))
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith('pending')
  })

  it('exposes errors and calls onError when opening fails', async () => {
    const onError = vi.fn()
    const blocked = new WarpCheckoutError('popup_blocked', 'Popup blocked')
    popup.mockRejectedValueOnce(blocked)
    const { result } = renderHook(() => useWarpCheckout({ checkoutUrl: CHECKOUT_URL, onError }))

    await act(() => result.current.openPopup())
    expect(result.current).toMatchObject({ isOpen: false, isLoading: false, error: blocked })
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(blocked)
  })

  it('destroys the checkout on unmount', async () => {
    const { result, unmount } = renderHook(() => useWarpCheckout({ checkoutUrl: CHECKOUT_URL }))
    await act(() => result.current.openModal())
    unmount()
    expect(calls.modal[0]!.destroy).toHaveBeenCalledTimes(1)
  })

  it('destroys a checkout that finishes opening after close()', async () => {
    let release: (url: string) => void = () => {}
    const fetchCheckoutUrl = () => new Promise<string>((resolve) => (release = resolve))
    const { result } = renderHook(() => useWarpCheckout({ fetchCheckoutUrl }))

    act(() => {
      void result.current.openModal()
    })
    act(() => result.current.close())
    expect(modal.mock.calls[0]![0].signal?.aborted).toBe(true)
    await act(async () => {
      release(CHECKOUT_URL)
      await flush()
    })
    expect(calls.modal[0]!.destroy).toHaveBeenCalledTimes(1)
    expect(result.current.isOpen).toBe(false)
  })
})
