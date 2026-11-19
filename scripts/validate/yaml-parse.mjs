/**
 * Parse a YAML string to JSON without schema validation — ported from Kibana's
 * `parseYamlToJSONWithoutValidation`. The `yaml` library's `parseDocument` is
 * error-tolerant (syntax errors land on `document.errors` rather than throwing),
 * so the document is always available regardless of success/failure.
 */

import { parseDocument } from 'yaml';

export function parseYamlToJSONWithoutValidation(yamlString) {
  // mapAsMap: true prevents a console warning about collection values being
  // stringified. maxAliasCount guards against billion-laughs alias expansion.
  const doc = parseDocument(yamlString, { mapAsMap: true, maxAliasCount: 100 });

  try {
    return {
      success: true,
      // mapAsMap: false ensures plain objects are returned instead of Map instances.
      json: doc.toJSON({ mapAsMap: false, maxAliasCount: 100 }),
      document: doc,
    };
  } catch (error) {
    return { success: false, error, document: doc };
  }
}
