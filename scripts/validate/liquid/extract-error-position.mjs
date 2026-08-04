/**
 * Extracts position information from liquidjs error messages — ported from
 * Kibana's `@kbn/workflows-yaml` `extractLiquidErrorPosition`. liquidjs reports
 * the start of the error line; this pinpoints the specific problematic token.
 */

const DEFAULT_ERROR_HIGHLIGHT_EXTENSION = 10;

/**
 * Tries to find the specific token causing the error based on message patterns.
 */
const findSpecificErrorToken = (text, errorMessage) => {
  const filterMatch = errorMessage.match(/undefined filter:\s*([a-zA-Z_]\w*)/);
  if (filterMatch) {
    const filterName = filterMatch[1];
    const filterRegex = new RegExp(`\\|\\s*${filterName}\\b`, 'g');
    const match = filterRegex.exec(text);
    if (match) {
      const pipeIndex = match.index;
      const filterStart = text.indexOf(filterName, pipeIndex);
      return { start: filterStart, end: filterStart + filterName.length };
    }
  }

  const tagMatch = errorMessage.match(/tag ['"](.*?)['"] not found/);
  if (tagMatch) {
    const tagName = tagMatch[1];
    const tagIndex = text.indexOf(tagName);
    if (tagIndex !== -1) {
      return { start: tagIndex, end: tagIndex + tagName.length };
    }
  }

  const unclosedMatch = errorMessage.match(/(output|tag) ['"](\{\{.*?|\{%.*?)['"] not closed/);
  if (unclosedMatch) {
    const content = unclosedMatch[2];
    const contentIndex = text.indexOf(content);
    if (contentIndex !== -1) {
      return {
        start: contentIndex,
        end: Math.min(
          contentIndex + content.length + DEFAULT_ERROR_HIGHLIGHT_EXTENSION,
          text.length
        ),
      };
    }
  }

  if (errorMessage.includes('invalid value expression')) {
    const emptyExpressionMatch = text.match(/\{\{\s*\}\}/);
    if (emptyExpressionMatch && emptyExpressionMatch.index !== undefined) {
      return {
        start: emptyExpressionMatch.index,
        end: emptyExpressionMatch.index + emptyExpressionMatch[0].length,
      };
    }
  }

  return null;
};

export const extractLiquidErrorPosition = (text, errorMessage) => {
  const specificTokenPosition = findSpecificErrorToken(text, errorMessage);
  if (specificTokenPosition) {
    return specificTokenPosition;
  }

  const lineColMatch = errorMessage.match(/line:(\d+),\s*col:(\d+)/);
  if (lineColMatch) {
    const line = parseInt(lineColMatch[1], 10);
    const col = parseInt(lineColMatch[2], 10);

    const lines = text.split('\n');
    let offset = 0;
    for (let i = 0; i < line - 1 && i < lines.length; i++) {
      offset += lines[i].length + 1; // +1 for newline character
    }
    offset += Math.max(0, col - 1);

    const remainingText = text.substring(offset);
    let end = offset + 1;
    if (remainingText.startsWith('{{')) {
      const closeMatch = remainingText.indexOf('}}');
      end = offset + (closeMatch > -1 ? closeMatch + 2 : Math.min(50, remainingText.length));
    } else if (remainingText.startsWith('{%')) {
      const closeMatch = remainingText.indexOf('%}');
      end = offset + (closeMatch > -1 ? closeMatch + 2 : Math.min(50, remainingText.length));
    } else {
      const wordMatch = remainingText.match(/^\S+/);
      end = offset + (wordMatch ? wordMatch[0].length : DEFAULT_ERROR_HIGHLIGHT_EXTENSION);
    }

    return { start: Math.max(0, offset), end: Math.min(text.length, end) };
  }

  const liquidPattern = /\{\{|\{%/g;
  let match;
  while ((match = liquidPattern.exec(text)) !== null) {
    const start = match.index;
    const remaining = text.substring(start);
    const end = remaining.search(/\}\}|%\}/) + start;
    return { start, end: end > start ? end + 2 : Math.min(start + 20, text.length) };
  }

  return { start: 0, end: Math.min(1, text.length) };
};
