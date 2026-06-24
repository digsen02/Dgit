export function paginateLines(lines: string[], maxChars = 3500): string[] {
  const pages: string[] = [];
  let current = "";
  for (const line of lines) {
    if ((current + line + "\n").length > maxChars && current.length > 0) {
      pages.push(current.trimEnd());
      current = "";
    }
    current += `${line}\n`;
  }
  if (current.trim().length > 0) pages.push(current.trimEnd());
  return pages.length > 0 ? pages : ["No entries."];
}
