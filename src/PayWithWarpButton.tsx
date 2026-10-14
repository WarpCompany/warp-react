import { useState, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react'
import { parseCheckoutUrl, type CheckoutTheme } from '@warpfi/js'
import { useLatest, type WarpCheckoutCallbacks, type WarpModalCallbacks } from './callbacks'
import { toCheckoutError } from './errors'
import { navigateTo } from './navigate'
import { useWarpCheckout } from './useWarpCheckout'

export type PayWithWarpMode = 'modal' | 'popup' | 'redirect'

type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  keyof WarpCheckoutCallbacks | keyof WarpModalCallbacks | 'children'
>

export interface PayWithWarpButtonProps extends WarpCheckoutCallbacks, WarpModalCallbacks, NativeButtonProps {
  /** Creates a session on your server and returns its `checkout_url`. Called on each click. */
  fetchCheckoutUrl: () => Promise<string>
  /** `modal` (default) opens an overlay, `popup` a new window, `redirect` navigates to the hosted checkout. */
  mode?: PayWithWarpMode
  /** `light`, `dark` or `auto` (follows the system). Default `auto`. Not used in `redirect` mode. */
  theme?: CheckoutTheme
  /** Override for self-hosted or staging checkout. Default `https://checkout.usewarp.net`. */
  checkoutOrigin?: string
  /** Button label. Default "Pay with Warp". */
  children?: ReactNode
}

/** A button that creates a session and opens the checkout in a modal, a popup, or by redirecting. */
export function PayWithWarpButton(props: PayWithWarpButtonProps) {
  const {
    fetchCheckoutUrl,
    mode = 'modal',
    theme,
    checkoutOrigin,
    onReady,
    onStatus,
    onComplete,
    onCancel,
    onReturn,
    onError,
    onClose,
    children,
    onClick,
    disabled,
    type = 'button',
    ...buttonProps
  } = props

  const latest = useLatest(props)
  const checkout = useWarpCheckout({
    fetchCheckoutUrl,
    theme,
    checkoutOrigin,
    onReady,
    onStatus,
    onComplete,
    onCancel,
    onReturn,
    onError,
    onClose,
  })
  const [redirecting, setRedirecting] = useState(false)

  const redirect = async () => {
    setRedirecting(true)
    try {
      let url: string
      try {
        url = await latest.current.fetchCheckoutUrl()
      } catch (error) {
        throw toCheckoutError(error, 'fetch_failed')
      }
      // Only ever navigate to a valid Warp checkout URL.
      parseCheckoutUrl(url, latest.current.checkoutOrigin)
      navigateTo(url)
    } catch (error) {
      setRedirecting(false)
      latest.current.onError?.(toCheckoutError(error))
    }
  }

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick?.(event)
    if (event.defaultPrevented) return
    if (mode === 'redirect') void redirect()
    else if (mode === 'popup') void checkout.openPopup()
    else void checkout.openModal()
  }

  const loading = mode === 'redirect' ? redirecting : checkout.isLoading

  return (
    <button
      {...buttonProps}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={handleClick}
    >
      {children ?? 'Pay with Warp'}
    </button>
  )
}
