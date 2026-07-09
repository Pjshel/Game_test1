import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'SPINE/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['src/shell/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    // 架构护栏:src/core 为纯确定性模拟层(WP0 交付物 4,纳入 CI)
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'phaser',
              message: 'src/core 是纯模拟层,禁止依赖 Phaser(模拟/表现分离军规)。',
            },
          ],
          patterns: [
            {
              group: ['phaser/*'],
              message: 'src/core 是纯模拟层,禁止依赖 Phaser(模拟/表现分离军规)。',
            },
            {
              group: ['**/shell/**'],
              message: 'src/core 不得反向依赖表现层 src/shell。',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'src/core 禁止访问 window(与渲染/DOM 完全解耦)。' },
        { name: 'document', message: 'src/core 禁止访问 document(与渲染/DOM 完全解耦)。' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: '确定性军规:禁止 Math.random,未来一律使用注入的种子 RNG。',
        },
        {
          object: 'Date',
          property: 'now',
          message: '确定性军规:禁止 Date.now,时间由外部以 dt 参数注入。',
        },
      ],
    },
  },
);
