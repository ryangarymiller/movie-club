import '@testing-library/jest-dom'

// Node 26 defines localStorage/sessionStorage as accessor properties on globalThis
// (even though they're undefined without --localstorage-file). This prevents Vitest's
// populateGlobal from overriding them with jsdom's working implementations.
// We manually forward them from the jsdom instance exposed by Vitest at globalThis.jsdom.
if (typeof globalThis.jsdom !== 'undefined') {
  const jsdomWindow = globalThis.jsdom.window
  Object.defineProperty(globalThis, 'localStorage', {
    get: () => jsdomWindow.localStorage,
    configurable: true,
  })
  Object.defineProperty(globalThis, 'sessionStorage', {
    get: () => jsdomWindow.sessionStorage,
    configurable: true,
  })
}
