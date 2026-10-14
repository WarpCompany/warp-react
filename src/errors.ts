import { WarpCheckoutError } from '@usewarp/js'

type ErrorCode = WarpCheckoutError['code']

/** Normalizes anything thrown while opening a checkout into a WarpCheckoutError. */
export function toCheckoutError(error: unknown, fallbackCode: ErrorCode = 'load_failed'): WarpCheckoutError {
  if (error instanceof WarpCheckoutError) return error
  const message = error instanceof Error ? error.message : String(error)
  return new WarpCheckoutError(fallbackCode, message, { cause: error })
}
