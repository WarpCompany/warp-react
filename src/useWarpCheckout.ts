import { useCallback, useEffect, useRef, useState } from 'react'
import {
  openCheckoutModal,
  openCheckoutPopup,
  type CheckoutInstance,
  type CheckoutOptions,
  type CheckoutStatus,
  type CheckoutTheme,
  type WarpCheckoutError,
} from '@usewarp/js'
import { useLatest, type WarpCheckoutCallbacks } from './callbacks'
import { toCheckoutError } from './errors'

export interface UseWarpCheckoutOptions extends WarpCheckoutCallbacks {
  /** `checkout_url` of a session created on your server. */
  checkoutUrl?: string
  /** Called on each open when `checkoutUrl` is not set. Creates a session on your server and returns its `checkout_url`. */
  fetchCheckoutUrl?: () => Promise<string>
  /** `light`, `dark` or `auto` (follows the system). Default `auto`. */
  theme?: CheckoutTheme
  /** Override for self-hosted or staging checkout. Default `https://checkout.usewarp.net`. */
  checkoutOrigin?: string
}

export interface UseWarpCheckoutResult {
  /** Opens the checkout in a full-screen modal. Resolves once it is open; failures go to `error` and `onError`. */
  openModal: () => Promise<void>
  /** Opens the checkout in a popup window. Call it directly from a click handler so the browser allows the popup. */
  openPopup: () => Promise<void>
  /** Closes the modal or popup. */
  close: () => void
  /** Latest session status reported by the checkout, or `null`. */
  status: CheckoutStatus | null
  /** Session id (`ps_...`) of the open checkout, or `null`. */
  sessionId: string | null
  /** `true` from the moment the modal or popup is opened until the customer cancels or returns, `close()` is called, or opening fails. */
  isOpen: boolean
  /** `true` while the checkout URL is being fetched and the modal or popup is opening. */
  isLoading: boolean
  /** Last error, cleared on the next open. */
  error: WarpCheckoutError | null
}

interface State {
  status: CheckoutStatus | null
  sessionId: string | null
  isOpen: boolean
  isLoading: boolean
  error: WarpCheckoutError | null
}

interface Session {
  instance: CheckoutInstance | null
  abort: AbortController
}

/** Closes a session whether or not it has finished opening. */
function teardown(session: Session | null): void {
  if (!session) return
  session.abort.abort()
  session.instance?.destroy()
}

const initialState: State = { status: null, sessionId: null, isOpen: false, isLoading: false, error: null }

/**
 * Opens the Pay with Warp checkout in a modal or popup and tracks its state.
 * Options are read when `openModal` / `openPopup` is called; the returned functions are stable.
 */
export function useWarpCheckout(options: UseWarpCheckoutOptions = {}): UseWarpCheckoutResult {
  const latest = useLatest(options)
  const [state, setState] = useState<State>(initialState)
  const current = useRef<Session | null>(null)

  const open = useCallback(
    (kind: 'modal' | 'popup'): Promise<void> => {
      const previous = current.current
      current.current = null
      teardown(previous)

      const session: Session = { instance: null, abort: new AbortController() }
      current.current = session
      const isCurrent = () => current.current === session
      const reported = new WeakSet<object>()

      const reportError = (error: unknown) => {
        if (!isCurrent()) return
        const checkoutError = toCheckoutError(error)
        if (reported.has(checkoutError)) return
        reported.add(checkoutError)
        setState((s) => ({ ...s, error: checkoutError }))
        latest.current.onError?.(checkoutError)
      }

      // The checkout has closed itself (cancel, return or modal dismissed): release it and update state.
      const finish = () => {
        if (!isCurrent()) return false
        current.current = null
        teardown(session)
        setState((s) => ({ ...s, isOpen: false, isLoading: false }))
        return true
      }

      const o = latest.current
      const checkoutOptions: CheckoutOptions = {
        checkoutUrl: o.checkoutUrl,
        theme: o.theme,
        checkoutOrigin: o.checkoutOrigin,
        onReady: () => {
          if (isCurrent()) latest.current.onReady?.()
        },
        onStatus: (status) => {
          if (!isCurrent()) return
          setState((s) => ({ ...s, status, sessionId: session.instance?.sessionId ?? s.sessionId }))
          latest.current.onStatus?.(status)
        },
        onComplete: () => {
          if (isCurrent()) latest.current.onComplete?.()
        },
        onCancel: () => {
          if (finish()) latest.current.onCancel?.()
        },
        onReturn: () => {
          if (finish()) latest.current.onReturn?.()
        },
        onError: reportError,
        signal: session.abort.signal,
      }
      const initialFetch = o.fetchCheckoutUrl
      if (!o.checkoutUrl && initialFetch) {
        checkoutOptions.fetchCheckoutUrl = () => (latest.current.fetchCheckoutUrl ?? initialFetch)()
      }

      setState({ ...initialState, isOpen: true, isLoading: true })

      // Called synchronously so a popup opens within the user gesture that triggered it.
      let pending: Promise<CheckoutInstance>
      try {
        pending = kind === 'popup' ? openCheckoutPopup(checkoutOptions) : openCheckoutModal(checkoutOptions)
      } catch (error) {
        pending = Promise.reject(error)
      }

      return pending.then(
        (instance) => {
          if (!isCurrent()) {
            instance.destroy()
            return
          }
          session.instance = instance
          setState((s) => ({
            ...s,
            isLoading: false,
            sessionId: instance.sessionId,
            status: instance.status ?? s.status,
          }))
        },
        (error: unknown) => {
          if (!isCurrent()) return
          reportError(error)
          current.current = null
          setState((s) => ({ ...s, isOpen: false, isLoading: false }))
        },
      )
    },
    [latest],
  )

  const openModal = useCallback(() => open('modal'), [open])
  const openPopup = useCallback(() => open('popup'), [open])

  const close = useCallback(() => {
    const session = current.current
    current.current = null
    teardown(session)
    setState((s) => ({ ...s, isOpen: false, isLoading: false }))
  }, [])

  useEffect(
    () => () => {
      const session = current.current
      current.current = null
      teardown(session)
    },
    [],
  )

  return { ...state, openModal, openPopup, close }
}
