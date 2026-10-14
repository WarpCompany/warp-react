// @vitest-environment node
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { mountCheckout } from '@usewarp/js'
import { PayWithWarpButton, WarpCheckout } from '../src'
import { CHECKOUT_URL } from './mockWarpJs'

vi.mock('@usewarp/js', async () => (await import('./mockWarpJs')).createWarpJsMock())

describe('server rendering', () => {
  it('renders without touching the DOM', () => {
    const html = renderToString(
      <>
        <WarpCheckout checkoutUrl={CHECKOUT_URL} className="checkout" />
        <PayWithWarpButton fetchCheckoutUrl={async () => CHECKOUT_URL} />
      </>,
    )
    expect(html).toContain('class="checkout"')
    expect(html).toContain('Pay with Warp')
    expect(vi.mocked(mountCheckout)).not.toHaveBeenCalled()
  })
})
