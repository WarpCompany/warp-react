import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openCheckoutModal, openCheckoutPopup } from '@warpfi/js'
import { PayWithWarpButton } from '../src'
import { navigateTo } from '../src/navigate'
import { CHECKOUT_URL, calls, flush } from './mockWarpJs'

vi.mock('@warpfi/js', async () => (await import('./mockWarpJs')).createWarpJsMock())
vi.mock('../src/navigate', () => ({ navigateTo: vi.fn() }))

const modal = vi.mocked(openCheckoutModal)
const popup = vi.mocked(openCheckoutPopup)
const navigate = vi.mocked(navigateTo)

function deferred() {
  let resolve: (url: string) => void = () => {}
  const fetchCheckoutUrl = vi.fn(() => new Promise<string>((r) => (resolve = r)))
  return { fetchCheckoutUrl, resolve: (url: string) => resolve(url) }
}

beforeEach(() => {
  calls.reset()
  modal.mockClear()
  popup.mockClear()
  navigate.mockClear()
})

afterEach(() => {
  cleanup()
})

describe('PayWithWarpButton', () => {
  it('renders "Pay with Warp" by default and passes button props through', () => {
    render(<PayWithWarpButton fetchCheckoutUrl={async () => CHECKOUT_URL} className="cta" data-testid="pay" />)
    const button = screen.getByTestId('pay')
    expect(button.textContent).toBe('Pay with Warp')
    expect(button.className).toBe('cta')
    expect(button.getAttribute('type')).toBe('button')
  })

  it('renders custom children', () => {
    render(<PayWithWarpButton fetchCheckoutUrl={async () => CHECKOUT_URL}>Checkout</PayWithWarpButton>)
    expect(screen.getByRole('button').textContent).toBe('Checkout')
  })

  it('opens a modal by default and is busy while loading', async () => {
    const { fetchCheckoutUrl, resolve } = deferred()
    const onComplete = vi.fn()
    render(<PayWithWarpButton fetchCheckoutUrl={fetchCheckoutUrl} theme="dark" onComplete={onComplete} />)
    const button = screen.getByRole('button') as HTMLButtonElement

    fireEvent.click(button)
    expect(modal).toHaveBeenCalledTimes(1)
    expect(modal.mock.calls[0]![0]).toMatchObject({ theme: 'dark' })
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')

    await act(async () => {
      resolve(CHECKOUT_URL)
      await flush()
    })
    expect(fetchCheckoutUrl).toHaveBeenCalledTimes(1)
    expect(button.disabled).toBe(false)
    expect(button.hasAttribute('aria-busy')).toBe(false)

    calls.modal[0]!.options.onComplete?.()
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('forwards onClose and can be clicked again once the modal closes', async () => {
    const onClose = vi.fn()
    const onCancel = vi.fn()
    render(<PayWithWarpButton fetchCheckoutUrl={async () => CHECKOUT_URL} onClose={onClose} onCancel={onCancel} />)
    const button = screen.getByRole('button') as HTMLButtonElement

    await act(async () => {
      fireEvent.click(button)
      await flush()
    })
    act(() => {
      calls.modal[0]!.options.onComplete?.()
      calls.modal[0]!.options.onClose?.()
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
    expect(calls.modal[0]!.destroy).toHaveBeenCalledTimes(1)

    await act(async () => {
      fireEvent.click(button)
      await flush()
    })
    expect(modal).toHaveBeenCalledTimes(2)
  })

  it('opens a popup synchronously within the click', () => {
    render(<PayWithWarpButton mode="popup" fetchCheckoutUrl={async () => CHECKOUT_URL} />)
    fireEvent.click(screen.getByRole('button'))
    expect(popup).toHaveBeenCalledTimes(1)
    expect(modal).not.toHaveBeenCalled()
  })

  it('redirects to the checkout URL in redirect mode', async () => {
    const { fetchCheckoutUrl, resolve } = deferred()
    render(<PayWithWarpButton mode="redirect" fetchCheckoutUrl={fetchCheckoutUrl} />)
    const button = screen.getByRole('button') as HTMLButtonElement

    fireEvent.click(button)
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')

    await act(async () => {
      resolve(CHECKOUT_URL)
      await flush()
    })
    expect(navigate).toHaveBeenCalledWith(CHECKOUT_URL)
    expect(modal).not.toHaveBeenCalled()
    expect(popup).not.toHaveBeenCalled()
  })

  it('refuses to redirect to a URL that is not a Warp checkout', async () => {
    const onError = vi.fn()
    render(<PayWithWarpButton mode="redirect" fetchCheckoutUrl={async () => 'https://evil.example/x'} onError={onError} />)
    const button = screen.getByRole('button') as HTMLButtonElement

    await act(async () => {
      fireEvent.click(button)
      await flush()
    })
    expect(navigate).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0]![0]).toMatchObject({ code: 'invalid_checkout_url' })
    expect(button.disabled).toBe(false)
  })

  it('reports fetch failures in redirect mode', async () => {
    const onError = vi.fn()
    const fetchCheckoutUrl = async () => {
      throw new Error('Network down')
    }
    render(<PayWithWarpButton mode="redirect" fetchCheckoutUrl={fetchCheckoutUrl} onError={onError} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
      await flush()
    })
    expect(onError.mock.calls[0]![0]).toMatchObject({ code: 'fetch_failed', message: 'Network down' })
  })

  it('runs onClick first and skips opening when it calls preventDefault', () => {
    const onClick = vi.fn((event: { preventDefault: () => void }) => event.preventDefault())
    render(<PayWithWarpButton fetchCheckoutUrl={async () => CHECKOUT_URL} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(modal).not.toHaveBeenCalled()
  })

  it('stays disabled when disabled is set', () => {
    render(<PayWithWarpButton fetchCheckoutUrl={async () => CHECKOUT_URL} disabled />)
    const button = screen.getByRole('button') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(modal).not.toHaveBeenCalled()
  })
})
