import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default [
  {
    files: ['**/*.rules'],
    plugins: {
      '@firebase/security-rules': firebaseRulesPlugin,
    },
    rules: {
      ...firebaseRulesPlugin.configs['flat/recommended'].rules,
    },
  },
  {
    ignores: ['dist/**/*', 'node_modules/**/*']
  }
];
