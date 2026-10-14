import { useEffect, useRef, type CSSProperties } from 'react'
import {
  mountCheckout,
  type CheckoutInstance,
  type CheckoutOptions,
  type CheckoutTheme,
} from '@warpfi/js'
import { useLatest, type WarpCheckoutCallbacks } from './callbacks'
import { toCheckoutError } from './errors'

export interface WarpCheckoutProps extends WarpCheckoutCallbacks {
  /** `checkout_url` of a session created on your server. */
  checkoutUrl?: string
  /** Called once per mount when `checkoutUrl` is not set. Creates a session on your server and returns its `checkout_url`. */
  fetchCheckoutUrl?: () => Promise<string>
  /** `light`, `dark` or `auto` (follows the system). Default `auto`. */
  theme?: CheckoutTheme
  /** Override for self-hosted or staging checkout. Default `https://checkout.usewarp.net`. */
  checkoutOrigin?: string
  /** Class name for the container element. */
  className?: string
  /** Inline style for the container element. */
  style?: CSSProperties
  /** `id` for the container element. */
  id?: string
}

/**
 * Inline embedded checkout. Renders a container and mounts the checkout iframe into it.
 * The iframe is remounted when `checkoutUrl`, `theme` or `checkoutOrigin` change. Callbacks
 * and `fetchCheckoutUrl` can be inline functions: they are read from refs and never cause a remount.
 */
export function WarpCheckout(props: WarpCheckoutProps) {
  const { checkoutUrl, theme, checkoutOrigin, className, style, id } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const latest = useLatest(props)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let active = true
    const abort = new AbortController()
    let instance: CheckoutInstance | null = null
    let host: HTMLDivElement | null = null
    const reported = new WeakSet<object>()

    const reportError = (error: unknown) => {
      if (!active) return
      const checkoutError = toCheckoutError(error)
      if (reported.has(checkoutError)) return
      reported.add(checkoutError)
      latest.current.onError?.(checkoutError)
    }

    const options: CheckoutOptions = {
      checkoutUrl,
      theme,
      checkoutOrigin,
      onReady: () => {
        if (active) latest.current.onReady?.()
      },
      onStatus: (status) => {
        if (active) latest.current.onStatus?.(status)
      },
      onComplete: () => {
        if (active) latest.current.onComplete?.()
      },
      onCancel: () => {
        if (active) latest.current.onCancel?.()
      },
      onReturn: () => {
        if (active) latest.current.onReturn?.()
      },
      onError: reportError,
      // Tears the checkout down immediately on cleanup, even while fetchCheckoutUrl is still pending.
      signal: abort.signal,
    }
    const initialFetch = latest.current.fetchCheckoutUrl
    if (!checkoutUrl && initialFetch) {
      options.fetchCheckoutUrl = () => (latest.current.fetchCheckoutUrl ?? initialFetch)()
    }

    // Start on a microtask. React StrictMode mounts, unmounts and remounts effects synchronously in
    // development, so the first pass is cancelled before it creates an iframe or calls fetchCheckoutUrl.
    queueMicrotask(() => {
      if (!active) return
      // Each mount gets its own host element, removed synchronously on cleanup, so a stale
      // iframe can never sit next to a new one while its mount promise is still settling.
      host = document.createElement('div')
      container.appendChild(host)
      mountCheckout(host, options).then(
        (mounted) => {
          if (active) instance = mounted
          else mounted.destroy()
        },
        reportError,
      )
    })

    return () => {
      active = false
      abort.abort()
      instance?.destroy()
      instance = null
      host?.remove()
      host = null
    }
    // Callbacks and fetchCheckoutUrl are read from `latest`, so new function identities do not remount.
  }, [checkoutUrl, theme, checkoutOrigin])

  return <div ref={containerRef} className={className} style={style} id={id} data-warp-checkout="" />
}
