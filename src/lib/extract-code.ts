const FENCE = /```(?:html|HTML)?\s*\n([\s\S]*?)(?:```|$)/;

/** Pulls the single html code block out of an assistant reply. */
export function extractCode(text: string): string | null {
  const match = text.match(FENCE);
  if (!match) return null;
  const code = match[1]?.trim();
  return code && code.length > 0 ? code : null;
}

/** The reply text with the code block removed, for display in the chat bubble. */
export function stripCode(text: string): string {
  return text.replace(FENCE, "").trim();
}
