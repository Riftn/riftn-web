/**
 * Page-wide state goes on `<body>` as a data attribute, never as a class.
 *
 * The theme sheets are full of `[class*="..."]` selectors. To the browser any
 * change to an element's `class` might change which of those match, and it has
 * no cheap way to tell which descendants could care, so it restyles everything
 * under the element. On `<body>` that is the whole page: a quarter of a second
 * frozen on a mid-range phone for adding one class, and again for removing it.
 * A data attribute only touches the elements its own rules name.
 *
 * The same goes for `<main>`, `#app-root` and anything else holding the feed:
 * flip an attribute there, not a class.
 */
export function markBody(name: `data-${string}`, on: boolean): void {
  if (typeof document === 'undefined') return;
  document.body.toggleAttribute(name, on);
}

export function bodyMarked(name: `data-${string}`): boolean {
  return typeof document !== 'undefined' && document.body.hasAttribute(name);
}
