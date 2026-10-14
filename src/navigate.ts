/** Full-page navigation to the hosted checkout. Kept separate so tests can replace it. */
export function navigateTo(url: string): void {
  window.location.assign(url)
}
