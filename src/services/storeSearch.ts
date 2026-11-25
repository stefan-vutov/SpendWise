/** Free price comparison: opens a shopping search for the item in the browser. */
export function shoppingSearchUrl(itemName: string): string {
  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(itemName)}`;
}
