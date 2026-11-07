/** Plain-text presentation only; saved responses and chained inputs stay intact. */
export function cleanOutputText(text: string): string {
  // Code samples can contain meaningful stars, such as multiplication operators.
  return text.split(/(```[\s\S]*?```|`[^`\n]*`)/gu).map((part, index) => index % 2 ? part : part
    .replace(/\*\*(?=\S)([^\n]*?\S)\*\*/gu, "$1")
    .replace(/(^|[^\p{L}\p{N}\\])\*(?=\S)([^*\n]*?\S)\*(?=$|[^\p{L}\p{N}])/gu, "$1$2")
    .replace(/^(\s*)\*\s+/gmu, "$1• ")
  ).join("");
}
