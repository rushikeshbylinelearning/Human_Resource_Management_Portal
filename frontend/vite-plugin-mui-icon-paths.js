/**
 * Rewrites barrel icon imports so Vite never prebundles 6MB+ icon packages:
 *   import { Add as AddIcon } from '@mui/icons-material'
 *   import { Megaphone, X } from 'lucide-react'
 * become per-icon files.
 */
const MUI_BARREL = /import\s*\{([^}]+)\}\s*from\s*['"]@mui\/icons-material['"]\s*;?/g;
const LUCIDE_BARREL = /import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]\s*;?/g;

function rewriteNamedImports(specifiers, toImportLine) {
  return specifiers
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [exported, alias] = part.split(/\s+as\s+/).map((s) => s.trim());
      const local = alias || exported;
      return toImportLine(exported, local);
    })
    .join('\n');
}

function toLucideKebab(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-zA-Z])([0-9])/g, '$1-$2')
    .toLowerCase();
}

export function muiIconPathImports() {
  return {
    name: 'icon-path-imports',
    enforce: 'pre',
    config() {
      return {
        optimizeDeps: {
          exclude: ['@mui/icons-material', 'lucide-react'],
        },
      };
    },
    transform(code, id) {
      if (id.includes('node_modules')) return null;
      if (!/\.[jt]sx?$/.test(id)) return null;

      let next = code;
      if (next.includes('@mui/icons-material')) {
        next = next.replace(MUI_BARREL, (_, specifiers) =>
          rewriteNamedImports(
            specifiers,
            (exported, local) => `import ${local} from '@mui/icons-material/${exported}';`
          )
        );
      }
      if (next.includes('lucide-react')) {
        next = next.replace(LUCIDE_BARREL, (_, specifiers) =>
          rewriteNamedImports(
            specifiers,
            (exported, local) =>
              `import ${local} from 'lucide-react/dist/esm/icons/${toLucideKebab(exported)}';`
          )
        );
      }

      if (next === code) return null;
      return { code: next, map: null };
    },
  };
}
