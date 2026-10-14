import { useLayoutEffect, useEffect, useRef, type MutableRefObject } from 'react'
import type { CheckoutStatus, WarpCheckoutError } from '@warpfi/js'

/** Event callbacks shared by every component and hook in this package. */
export interface WarpCheckoutCallbacks {
  /** The checkout page has loaded. */
  onReady?: () => void
  /** Sent on load and whenever the session status changes. */
  onStatus?: (status: CheckoutStatus) => void
  /** The session status became `completed`. Confirm the payment on your server before fulfilling. */
  onComplete?: () => void
  /** The customer cancelled, or closed the modal or popup before the payment completed. */
  onCancel?: () => void
  /** The customer clicked "Back to merchant" on the success page. */
  onReturn?: () => void
  /** Loading, fetching or opening the checkout failed. */
  onError?: (error: WarpCheckoutError) => void
}

/** Callbacks only used by the modal and popup (`useWarpCheckout` and `PayWithWarpButton`). */
export interface WarpModalCallbacks {
  /**
   * The modal or popup closed: dismissed by the customer (also after paying), or closed after
   * `onCancel` / `onReturn`. Called last, once per open. Not called when you call `close()`.
   */
  onClose?: () => void
}

// useLayoutEffect warns during server rendering; fall back to useEffect there.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/** Keeps a ref pointing at the latest value so effects can read it without re-running. */
export function useLatest<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value)
  useIsomorphicLayoutEffect(() => {
    ref.current = value
  })
  return ref
}
