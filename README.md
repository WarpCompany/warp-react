<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./.github/assets/symbol_white.png" />
    <img src="./.github/assets/symbol_black.png" alt="Warp" height="64" />
  </picture>
</p>

<h1 align="center">Pay with Warp: React</h1>

<p align="center">
  React components and hooks for the <a href="https://usewarp.net">Pay with Warp</a> embedded checkout.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@usewarp/react"><img src="https://img.shields.io/npm/v/@usewarp/react?color=9E1FAA" alt="npm" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT" /></a>
  <a href="https://developer.usewarp.net"><img src="https://img.shields.io/badge/docs-developer.usewarp.net-9E1FAA" alt="Docs" /></a>
</p>

---

Your server creates a checkout session with your secret key and returns its `checkout_url`. These components show that checkout inside your React app, as an inline embed, a modal or a popup, so the customer pays without leaving your site. Warp then notifies your server with a signed webhook.

> [!WARNING]
> This project is under active development. Test with `sk_test_` keys on testnets before accepting mainnet payments.

## Features

- `<WarpCheckout>` inline embed that resizes to fit its content
- `<PayWithWarpButton>` that opens the checkout in a modal, a popup or by redirecting
- `useWarpCheckout` hook for custom buttons, with live `status`, `sessionId` and `error`
- Safe under React StrictMode: one iframe, one `fetchCheckoutUrl` call per mount
- Works with Next.js App Router and server rendering (the package is a client module)
- Typed callbacks for ready, status, complete, cancel, return and errors
- Built on [@usewarp/js](https://github.com/WarpCompany/warp-js); React 18 and 19

## Installation

Requirements: React 18 or later.

```bash
npm install @usewarp/react
```

## Usage

Create the session on your server. This Next.js route handler uses [@usewarp/node](https://github.com/WarpCompany/warp-node) and takes the amount from your own records, never from the browser:

```ts
// app/api/checkout/route.ts
import Warp from '@usewarp/node'

const warp = new Warp(process.env.WARP_SECRET_KEY!)

export async function POST(request: Request) {
  const { orderId } = await request.json()
  const order = await getOrder(orderId) // your own data layer

  const session = await warp.checkout.sessions.create({
    amount_usd: order.totalUsd,
    description: `Order #${order.id}`,
    metadata: { order_id: order.id },
    return_url: `https://example.com/orders/${order.id}`,
    cancel_url: 'https://example.com/cart',
  })

  return Response.json({ checkoutUrl: session.checkout_url })
}
```

Then render the checkout in a client component:

```tsx
// app/checkout/checkout.tsx
'use client'

import { WarpCheckout } from '@usewarp/react'
import { useRouter } from 'next/navigation'

async function createCheckout(orderId: string): Promise<string> {
  const res = await fetch('/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId }),
  })
  if (!res.ok) throw new Error('Could not start checkout')
  const { checkoutUrl } = await res.json()
  return checkoutUrl
}

export function Checkout({ orderId }: { orderId: string }) {
  const router = useRouter()

  return (
    <WarpCheckout
      fetchCheckoutUrl={() => createCheckout(orderId)}
      onComplete={() => router.push(`/orders/${orderId}`)}
      onCancel={() => router.push('/cart')}
      onError={(error) => console.error(error.code, error.message)}
    />
  )
}
```

`fetchCheckoutUrl` is called once per mount. If you already have the URL, pass `checkoutUrl` instead. The checkout is remounted when `checkoutUrl`, `theme` or `checkoutOrigin` change. Callbacks can be inline functions; changing them never remounts the iframe.

### Modal

`<PayWithWarpButton>` creates the session when clicked and opens the checkout in a full-screen modal. The modal closes on Escape, the backdrop or the close button (calling `onCancel` if the payment has not completed), and after the customer cancels or returns from the success page. Every time it closes, `onClose` is called last. The button is disabled and `aria-busy` while the checkout is loading.

```tsx
'use client'

import { PayWithWarpButton } from '@usewarp/react'
// createCheckout() is the helper from the Usage example above.

export function BuyButton({ orderId }: { orderId: string }) {
  return (
    <PayWithWarpButton
      className="btn btn-primary"
      fetchCheckoutUrl={() => createCheckout(orderId)}
      onComplete={() => console.log('Payment submitted, waiting for the webhook')}
    />
  )
}
```

The label defaults to "Pay with Warp". Pass children to change it. Any other `<button>` props are forwarded.

### Popup and redirect

Framing only works on the origins allowed for the session (see below). Where that does not fit, use `mode="popup"` to open the checkout in a new window, or `mode="redirect"` to send the customer to the hosted page:

```tsx
<PayWithWarpButton mode="popup" fetchCheckoutUrl={() => createCheckout(orderId)} />
<PayWithWarpButton mode="redirect" fetchCheckoutUrl={() => createCheckout(orderId)}>
  Continue to payment
</PayWithWarpButton>
```

Browsers only allow popups opened directly from a click. The button opens the window synchronously and loads the checkout once your server responds. If it is blocked anyway, `onError` receives a `popup_blocked` error. Redirect mode checks that the URL is a Warp checkout URL before calling `window.location.assign`.

### Hook

`useWarpCheckout` gives you the same modal and popup behind your own UI:

```tsx
'use client'

import { useWarpCheckout } from '@usewarp/react'
// createCheckout() is the helper from the Usage example above.

export function CustomCheckout({ orderId }: { orderId: string }) {
  const { openModal, openPopup, close, status, sessionId, isOpen, isLoading, error } = useWarpCheckout({
    fetchCheckoutUrl: () => createCheckout(orderId),
    theme: 'dark',
    onComplete: () => console.log('completed'),
  })

  return (
    <div>
      <button onClick={openModal} disabled={isLoading}>Pay in a modal</button>
      <button onClick={openPopup} disabled={isLoading}>Pay in a new window</button>
      {isOpen && <button onClick={close}>Close</button>}
      {status && <p>Session {sessionId}: {status}</p>}
      {error && <p role="alert">{error.message}</p>}
    </div>
  )
}
```

Call `openPopup` directly in the click handler, without awaiting anything first, so the browser allows the window. The returned functions are stable and always use the latest options. `isOpen` becomes `false` whenever the modal or popup closes (including when the customer closes it after paying, which also calls `onClose`), on `close()` and when opening fails. Opening again closes the previous checkout, and unmounting the component closes it too.

### Allowed origins

The checkout can only be framed by the origins of the session's `return_url` and `cancel_url`. A session created without them cannot be embedded, so use `mode="redirect"` for those. Sessions on testnet also allow `http://localhost` and `http://127.0.0.1` on any port, so you can develop locally with an `sk_test_` key.

### Confirm payment on your server

Events from the checkout (`onStatus`, `onComplete`, `onCancel`, `onReturn`) are UI signals only. Do not fulfil an order because `onComplete` fired. Confirm the payment with the `payment.completed` [webhook](https://developer.usewarp.net/warp-pay/webhooks), or retrieve the session on your server with `warp.checkout.sessions.retrieve(id)`.

### Errors

`onError` receives a `WarpCheckoutError` with a `code`:

| Code | Meaning |
| ---- | ------- |
| `invalid_checkout_url` | The URL is not a checkout URL on `checkoutOrigin`, or no URL was given |
| `fetch_failed` | `fetchCheckoutUrl` threw or returned no URL |
| `popup_blocked` | The browser blocked the popup |
| `load_failed` | The checkout could not be loaded |
| `destroyed` | The checkout was closed before it finished loading |

### Props

`<WarpCheckout>`

| Prop | Type | Description |
| ---- | ---- | ----------- |
| `checkoutUrl` | `string` | `checkout_url` of a session created on your server |
| `fetchCheckoutUrl` | `() => Promise<string>` | Creates a session on your server and returns its `checkout_url`. Used when `checkoutUrl` is not set |
| `theme` | `'light' \| 'dark' \| 'auto'` | Default `auto` (follows the customer's system setting) |
| `checkoutOrigin` | `string` | Self-hosted or staging checkout. Default `https://checkout.usewarp.net` |
| `onReady` | `() => void` | The checkout page has loaded |
| `onStatus` | `(status: CheckoutStatus) => void` | `pending`, `processing`, `completed`, `failed` or `expired`. Sent on load and on every change |
| `onComplete` | `() => void` | The status became `completed` |
| `onCancel` | `() => void` | The customer cancelled |
| `onReturn` | `() => void` | The customer clicked "Back to merchant" on the success page |
| `onError` | `(error: WarpCheckoutError) => void` | Loading the checkout failed |
| `className`, `style`, `id` | | Applied to the container element |

`<PayWithWarpButton>` takes `fetchCheckoutUrl` (required), `mode` (`'modal'` by default, `'popup'` or `'redirect'`), `theme`, `checkoutOrigin`, the same callbacks plus `onClose`, `children` and any `<button>` props.

`useWarpCheckout(options)` takes `checkoutUrl` or `fetchCheckoutUrl`, `theme`, `checkoutOrigin`, the same callbacks plus `onClose`.

| Callback | Type | Description |
| -------- | ---- | ----------- |
| `onClose` | `() => void` | Modal and popup only. The checkout closed: dismissed by the customer (also after paying), or closed after `onCancel` / `onReturn`. Called last, once per open. Not called when you call `close()` |

## API

| Export | Description |
| ------ | ----------- |
| `WarpCheckout` | Inline embedded checkout |
| `PayWithWarpButton` | Button that opens the checkout in a modal, a popup or by redirecting |
| `useWarpCheckout(options)` | Returns `{ openModal, openPopup, close, status, sessionId, isOpen, isLoading, error }` |
| `WarpCheckoutError` | Error class with a `code`, re-exported from `@usewarp/js` |
| `DEFAULT_CHECKOUT_ORIGIN` | `https://checkout.usewarp.net` |
| `CheckoutStatus`, `CheckoutTheme`, `CheckoutOptions`, `CheckoutInstance` | Types re-exported from `@usewarp/js` |
| `WarpCheckoutProps`, `PayWithWarpButtonProps`, `PayWithWarpMode`, `UseWarpCheckoutOptions`, `UseWarpCheckoutResult`, `WarpCheckoutCallbacks` | Prop and option types |

## Documentation

| Topic | Description |
| ----- | ----------- |
| [Embedded checkout](https://developer.usewarp.net/warp-pay/embedded-checkout) | Embed modes, events, allowed origins |
| [Webhooks](https://developer.usewarp.net/warp-pay/webhooks) | Signature verification and retries |
| [API reference](https://developer.usewarp.net/api-reference/introduction) | Endpoints, parameters and errors |

Full product documentation is at [developer.usewarp.net](https://developer.usewarp.net).

## Development

```bash
git clone https://github.com/WarpCompany/warp-react.git
cd warp-react
npm install
npm test
npm run build
```

Until `@usewarp/js` is published to npm, clone [warp-js](https://github.com/WarpCompany/warp-js) next to this repository, build it, and install it with `npm install --no-save ../warp-js` instead of `npm install`.

## Project structure

```
src/            Components, hook and shared callback helpers
test/           Vitest tests with a mocked @usewarp/js
```

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).

Please report security issues privately as described in [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE)
