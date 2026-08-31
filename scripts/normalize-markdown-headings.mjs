import { pathToFileURL } from 'node:url';

const scanLines = (source, visitor) => {
  const lines = source.split(/(?<=\n)/);
  let fence = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!fence) {
        fence = { character: marker[0], length: marker.length };
      } else if (
        marker[0] === fence.character &&
        marker.length >= fence.length &&
        line.slice(fenceMatch[0].length).trim() === ''
      ) {
        fence = null;
      }
      continue;
    }

    if (!fence) visitor(lines, index, line);
  }

  return lines;
};

export const hasTopLevelMarkdownHeading = (source) => {
  let found = false;
  scanLines(source, (_lines, _index, line) => {
    if (/^\s{0,3}#(?:[\t ]+|\r?\n?$)/.test(line)) found = true;
  });
  return found;
};

export const normalizeBlogBodyHeadings = (source) => {
  if (!hasTopLevelMarkdownHeading(source)) return source;

  return scanLines(source, (lines, index, line) => {
    lines[index] = line.replace(/^(\s{0,3})(#{1,5})(?=[\t ]|\r?\n?$)/, '$1$2#');
  }).join('');
};

const invokedUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedUrl) {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  process.stdout.write(normalizeBlogBodyHeadings(input));
}
