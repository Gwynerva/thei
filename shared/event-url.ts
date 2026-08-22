export function buildEventUrl(humanReadable: string, publicId: string): string {
  const pathPart = humanReadable ? `${humanReadable}-${publicId}` : publicId;
  return `/events/${pathPart}/`;
}

export function publicIdFromEventUrlPart(value: string): string {
  return value.slice(value.lastIndexOf('-') + 1);
}
