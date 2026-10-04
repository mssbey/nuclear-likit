import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

/** @type {import('eslint').Linter.Config[]} */
const config = [
  { ignores: ['.next/**', 'node_modules/**', 'scripts/**', 'public/**', 'next-env.d.ts'] },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      'react/no-unescaped-entities': 'off',
      // Bu proje; hydration-guard (useMounted), URL/prop değişiminde state
      // senkronizasyonu ve embla/IntersectionObserver gibi harici API'lerle
      // senkronizasyon için standart useEffect+setState örüntülerini kasıtlı
      // olarak kullanıyor. Bu kural bunları hatalı işaretliyor.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
];

export default config;
