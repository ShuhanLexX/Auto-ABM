// Guard against a runaway assistant message freezing the app. Very long content
// (or a model that dumped a tool call as plain text instead of a real function
// call) is collapsed behind an opt-in expander so we never hand a megabyte of
// text to the markdown/DOMPurify/KaTeX pipeline on every render.

export const LONG_CONTENT_CHARS = 6000

// Signatures of a tool call that leaked into visible assistant text instead of
// being emitted as a real function call (seen with models that lack reliable
// native tool calling — the "DSML" text protocol dumps show up verbatim).
const TOOL_DUMP_PATTERNS = [
  /DSML\s*[|｜]\s*(tool_calls|invoke|parameter)/i,
  /\binvoke\s+name\s*=\s*"(abm_|[a-z_]+)"/i,
  /\bparameter\s+name\s*=\s*"proposals"/i,
]

export type Overflow = { reason: 'tool-dump' | 'long'; chars: number }

export function classifyOverflow(content: string): Overflow | null {
  const chars = content.length
  if (TOOL_DUMP_PATTERNS.some((re) => re.test(content))) return { reason: 'tool-dump', chars }
  if (chars > LONG_CONTENT_CHARS) return { reason: 'long', chars }
  return null
}
