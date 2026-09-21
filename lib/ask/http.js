/**
 * Reading a request body with a ceiling on it.
 *
 * Both Ask Poll360 routes take JSON from this product's own screen, which is
 * small. A body over the ceiling is refused before it is parsed, so a large
 * post costs the server a header read and nothing more.
 */

/** The body as JSON, or null if it is too large or not JSON at all. */
export async function readJson(request, limit) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > limit) return null;
  try {
    const text = await request.text();
    if (text.length > limit) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}
