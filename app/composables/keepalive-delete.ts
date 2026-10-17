/**
 * A DELETE sent with keepalive, so a tab that is closing still sends it.
 * Refused, it says so; whoever does not care catches it.
 */
export async function sendDelete(path: string): Promise<void> {
  const response = await fetch(sitePath(path), {
    method: 'DELETE',
    keepalive: true,
  });
  if (!response.ok) throw new Error(phrase.value.error_title);
}
