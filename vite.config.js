import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function appLiveStringLiteralHotfix() {
  return {
    name: 'app-live-string-literal-hotfix',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/AppLive.jsx') && !id.endsWith('\\src\\AppLive.jsx')) return null;

      const fixed = code
        .split("return `${lines.join('\n')}\n`;").join("return `${lines.join('\\n')}\\n`;")
        .split("  `).join('\n');").join("  `).join('\\n');")
        .split(".join('\n        ')}").join(".join('\\n        ')}");

      return fixed === code ? null : { code: fixed, map: null };
    },
  };
}

export default defineConfig({
  plugins: [appLiveStringLiteralHotfix(), react()],
});
