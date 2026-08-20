export const CONTENT_CAPTION_SANITIZE = {
  b: true,
  strong: true,
  i: true,
  em: true,
  a: {
    href: true,
    target: true,
    rel: true,
    'data-content-link': true,
    'data-entity-type': true,
    'data-entity-id': true,
  },
} as const;
