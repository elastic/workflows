/**
 * LiquidJS syntax validation — ported from Kibana's `@kbn/workflows-yaml`
 * `validateLiquidTemplate`. Visits every scalar in the parsed YAML document,
 * parses any `{{ }}` / `{% %}` content with the real LiquidJS engine, and maps
 * parse errors back to absolute line/column positions in the source string.
 */

import { Scalar, visit } from 'yaml';
import { extractLiquidErrorPosition } from './extract-error-position.mjs';
import { parseTemplateString } from './engine.mjs';

function convertOffsetToLineColumn(text, offset) {
  let line = 1;
  let lastNewline = -1;
  for (let i = 0; i < offset; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lastNewline = i;
    }
  }
  return { line, column: offset - lastNewline };
}

/**
 * Maps an error position (relative to `node.value`) back to an absolute offset
 * range within the full YAML source string. Block scalars strip indentation, so
 * a linear shift is wrong there and we search the node's source span instead.
 */
function mapToAbsolutePosition(yamlString, node, errorMessage, relativePosition) {
  const range = node.range;
  if (!range) return relativePosition;

  switch (node.type) {
    case Scalar.BLOCK_FOLDED:
    case Scalar.BLOCK_LITERAL: {
      const nodeSource = yamlString.substring(range[0], range[2]);
      const posInSource = extractLiquidErrorPosition(nodeSource, errorMessage);
      return { start: range[0] + posInSource.start, end: range[0] + posInSource.end };
    }
    case Scalar.QUOTE_DOUBLE:
    case Scalar.QUOTE_SINGLE: {
      const valueStart = range[0] + 1;
      return { start: valueStart + relativePosition.start, end: valueStart + relativePosition.end };
    }
    default: {
      return { start: range[0] + relativePosition.start, end: range[0] + relativePosition.end };
    }
  }
}

const LIQUID_OUTPUT_PATTERN = '{{';
const LIQUID_TAG_PATTERN = '{%';

export function validateLiquidTemplate(yamlString, yamlDocument) {
  const errors = [];

  visit(yamlDocument, {
    Scalar(key, node) {
      if (key === 'key') return;
      if (!node.range) return;
      if (typeof node.value !== 'string') return;
      if (!node.value.includes(LIQUID_OUTPUT_PATTERN) && !node.value.includes(LIQUID_TAG_PATTERN)) {
        return;
      }

      try {
        parseTemplateString(node.value);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Invalid Liquid syntax';
        const relativePosition = extractLiquidErrorPosition(node.value, errorMessage);
        const absPosition = mapToAbsolutePosition(yamlString, node, errorMessage, relativePosition);

        const startPos = convertOffsetToLineColumn(yamlString, absPosition.start);
        const endPos = convertOffsetToLineColumn(yamlString, absPosition.end);

        errors.push({
          message: errorMessage.replace(/, line:\d+, col:\d+/g, ''),
          startLine: startPos.line,
          startColumn: startPos.column,
          endLine: endPos.line,
          endColumn: endPos.column,
        });
      }
    },
  });

  return errors;
}
