/** WEBH is an explicit security-analysis mode, not the default for every chat. */
export function isWebhRequest(text: string): boolean {
  return /\bWEBH(?:\.md)?\b|\b(?:pentest(?:ing)?|hacker|hacking|vulnerabilit(?:y|ies)|kerentanan|celah keamanan|bug bounty|exploit|xss|csrf|ssrf|sqli|sql injection|idor|bola|privilege escalation|code audit|audit keamanan|security audit|web security|uji keamanan|tes keamanan)\b/i.test(text);
}