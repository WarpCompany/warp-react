import { vi } from 'vitest'
import type { CheckoutInstance, CheckoutOptions } from '@usewarp/js'

export const SESSION_ID = 'ps_0123456789abcdef0123456789abcdef'
export const CHECKOUT_URL = `https://checkout.usewarp.net/session/${SESSION_ID}`

export interface MockInstance extends CheckoutInstance {
  destroy: ReturnType<typeof vi.fn>
  options: CheckoutOptions
}

type ErrorCode = 'invalid_checkout_url' | 'fetch_failed' | 'popup_blocked' | 'load_failed' | 'destroyed'

class MockWarpCheckoutError extends Error {
  readonly code: ErrorCode
  constructor(code: ErrorCode, message: string, _options?: { cause?: unknown }) {
    super(message)
    this.name = 'WarpCheckoutError'
    this.code = code
  }
}

async function resolveUrl(options: CheckoutOptions): Promise<string> {
  if (options.checkoutUrl) return options.checkoutUrl
  if (options.fetchCheckoutUrl) return options.fetchCheckoutUrl()
  throw new MockWarpCheckoutError('invalid_checkout_url', 'No checkout URL')
}

function createInstance(options: CheckoutOptions, element: HTMLElement | null): MockInstance {
  return {
    sessionId: SESSION_ID,
    status: null,
    options,
    destroy: vi.fn(() => element?.remove()),
  }
}

/** Shared state so tests can reach the options passed to the latest call. */
export const calls = {
  mount: [] as MockInstance[],
  modal: [] as MockInstance[],
  popup: [] as MockInstance[],
  reset() {
    this.mount.length = 0
    this.modal.length = 0
    this.popup.length = 0
  },
}

export function createWarpJsMock() {
  return {
    WarpCheckoutError: MockWarpCheckoutError,
    DEFAULT_CHECKOUT_ORIGIN: 'https://checkout.usewarp.net',
    parseCheckoutUrl: vi.fn((url: string) => {
      const parsed = new URL(url)
      const match = /^\/session\/(ps_[0-9a-f]{32})$/.exec(parsed.pathname)
      if (parsed.origin !== 'https://checkout.usewarp.net' || !match?.[1]) {
        throw new MockWarpCheckoutError('invalid_checkout_url', 'Invalid checkout URL')
      }
      return { url: parsed, sessionId: match[1] }
    }),
    mountCheckout: vi.fn(async (container: HTMLElement | string, options: CheckoutOptions) => {
      const url = await resolveUrl(options)
      const iframe = document.createElement('iframe')
      iframe.src = `${url}?embed=iframe`
      ;(container as HTMLElement).appendChild(iframe)
      const instance = createInstance(options, iframe)
      calls.mount.push(instance)
      return instance
    }),
    openCheckoutModal: vi.fn(async (options: CheckoutOptions) => {
      await resolveUrl(options)
      const instance = createInstance(options, null)
      calls.modal.push(instance)
      return instance
    }),
    openCheckoutPopup: vi.fn(async (options: CheckoutOptions) => {
      await resolveUrl(options)
      const instance = createInstance(options, null)
      calls.popup.push(instance)
      return instance
    }),
  }
}

/** Flushes pending microtasks and promise chains. */
export async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}
