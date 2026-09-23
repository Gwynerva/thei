/**
 * One bundled icon, reduced to what drawing it again takes: the box it was
 * drawn in and the markup inside its `<svg>`.
 */
export type IconSymbol = {
  viewBox: string;
  body: string;
};

export function parseIconSvg(content: string): IconSymbol {
  const viewBox = content.match(/viewBox="([^"]*)"/)?.[1] ?? '0 0 24 24';
  const body =
    content
      .replace(/<\?xml[^>]*>/g, '')
      .match(/<svg[^>]*>([\s\S]*?)<\/svg>/)?.[1]
      ?.trim() ?? '';
  return { viewBox, body };
}
