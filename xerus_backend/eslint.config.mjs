// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            // Align with project conventions
            '@typescript-eslint/no-unused-vars': ['warn', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
            }],
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-require-imports': 'off',
            'no-console': 'off',
        },
    },
    // Test files are excluded from tsconfig.json, so disable type-aware
    // linting for them to avoid "not found by project service" errors.
    {
        files: ['**/__tests__/**/*.ts', '**/*.test.ts'],
        languageOptions: {
            parserOptions: {
                projectService: false,
                project: null,
            },
        },
        ...tseslint.configs.disableTypeChecked,
    },
    {
        ignores: [
            'dist/**',
            'node_modules/**',
            'scripts/**',
        ],
    },
);
