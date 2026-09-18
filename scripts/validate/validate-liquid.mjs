/**
 * The LiquidJS syntax validation layer. Parses every `{{ }}` / `{% %}` scalar
 * with the real LiquidJS engine and reports malformed tags/filters/output.
 * Runs unconditionally (even when earlier layers failed). Scope is syntax only:
 * it does not verify that referenced variables/steps resolve.
 */

import { validateLiquidTemplate } from './liquid/validate-liquid-template.mjs';

export const validateLiquid = (yaml, document) =>
  validateLiquidTemplate(yaml, document).map((error) => ({
    source: 'liquid',
    message: error.message,
    line: error.startLine,
    column: error.startColumn,
  }));
