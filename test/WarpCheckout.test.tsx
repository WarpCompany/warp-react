import { StrictMode } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountCheckout } from '@usewarp/js'
import { WarpCheckout } from '../src'
import { CHECKOUT_URL, calls, flush } from './mockWarpJs'

vi.mock('@usewarp/js', async () => (await import('./mockWarpJs')).createWarpJsMock())

const mount = vi.mocked(mountCheckout)

async function settle() {
  await act(async () => {
    await flush()
  })
}

beforeEach(() => {
  calls.reset()
  mount.mockClear()
})

afterEach(() => {
  cleanup()
})

describe('WarpCheckout', () => {
  it('mounts the checkout into its container and destroys it on unmount', async () => {
    const { container, unmount } = render(<WarpCheckout checkoutUrl={CHECKOUT_URL} theme="dark" className="pay" />)
    await settle()

    expect(mount).toHaveBeenCalledTimes(1)
    const [target, options] = mount.mock.calls[0]!
    expect(container.querySelector('.pay')?.contains(target as HTMLElement)).toBe(true)
    expect(options).toMatchObject({ checkoutUrl: CHECKOUT_URL, theme: 'dark' })
    expect(container.querySelectorAll('iframe')).toHaveLength(1)

    const instance = calls.mount[0]!
    unmount()
    expect(instance.destroy).toHaveBeenCalledTimes(1)
    expect(document.querySelectorAll('iframe')).toHaveLength(0)
  })

  it('mounts once and calls fetchCheckoutUrl once under StrictMode', async () => {
    const fetchCheckoutUrl = vi.fn(async () => CHECKOUT_URL)
    const { container } = render(
      <StrictMode>
        <WarpCheckout fetchCheckoutUrl={fetchCheckoutUrl} />
      </StrictMode>,
    )
    await settle()

    expect(mount).toHaveBeenCalledTimes(1)
    expect(fetchCheckoutUrl).toHaveBeenCalledTimes(1)
    expect(container.querySelectorAll('iframe')).toHaveLength(1)
  })

  it('reads callbacks from refs so new inline functions do not remount', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const onComplete = vi.fn()
    const { rerender } = render(<WarpCheckout checkoutUrl={CHECKOUT_URL} onStatus={first} />)
    await settle()
    rerender(<WarpCheckout checkoutUrl={CHECKOUT_URL} onStatus={second} onComplete={onComplete} />)
    await settle()

    expect(mount).toHaveBeenCalledTimes(1)
    const options = calls.mount[0]!.options
    act(() => {
      options.onStatus?.('completed')
      options.onComplete?.()
    })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith('completed')
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('forwards ready, cancel and return events', async () => {
    const onReady = vi.fn()
    const onCancel = vi.fn()
    const onReturn = vi.fn()
    render(<WarpCheckout checkoutUrl={CHECKOUT_URL} onReady={onReady} onCancel={onCancel} onReturn={onReturn} />)
    await settle()

    const options = calls.mount[0]!.options
    options.onReady?.()
    options.onCancel?.()
    options.onReturn?.()
    expect(onReady).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onReturn).toHaveBeenCalledTimes(1)
  })

  it('remounts when checkoutUrl changes', async () => {
    const otherUrl = CHECKOUT_URL.replace(/.$/, '0')
    const { container, rerender } = render(<WarpCheckout checkoutUrl={CHECKOUT_URL} />)
    await settle()
    const first = calls.mount[0]!

    rerender(<WarpCheckout checkoutUrl={otherUrl} />)
    await settle()

    expect(first.destroy).toHaveBeenCalledTimes(1)
    expect(mount).toHaveBeenCalledTimes(2)
    expect(mount.mock.calls[1]![1]).toMatchObject({ checkoutUrl: otherUrl })
    const iframes = container.querySelectorAll('iframe')
    expect(iframes).toHaveLength(1)
    expect(iframes[0]!.src).toContain(otherUrl)
  })

  it('destroys an instance that resolves after unmount', async () => {
    let release: (url: string) => void = () => {}
    const fetchCheckoutUrl = () => new Promise<string>((resolve) => (release = resolve))
    const { unmount } = render(<WarpCheckout fetchCheckoutUrl={fetchCheckoutUrl} />)
    await settle()
    unmount()
    expect(mount.mock.calls[0]![1].signal?.aborted).toBe(true)

    await act(async () => {
      release(CHECKOUT_URL)
      await flush()
    })
    expect(calls.mount[0]!.destroy).toHaveBeenCalledTimes(1)
    expect(document.querySelectorAll('iframe')).toHaveLength(0)
  })

  it('reports a failed mount to onError once', async () => {
    const onError = vi.fn()
    const fetchCheckoutUrl = vi.fn(async () => {
      throw new Error('Server error')
    })
    render(<WarpCheckout fetchCheckoutUrl={fetchCheckoutUrl} onError={onError} />)
    await settle()

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0]![0]).toMatchObject({ name: 'WarpCheckoutError', message: 'Server error' })
  })
})
