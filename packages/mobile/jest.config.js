/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  moduleNameMapper: {
    '^@salon/shared$': '<rootDir>/../shared/src/index.ts',
    '^react-native$': '<rootDir>/src/test-utils/react-native.ts',
    // The shared package's barrel uses ESM-style `.js` specifiers in its
    // relative re-exports; under ts-jest we resolve them to the TS sources.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    // tsconfig uses `jsx: react-native` (preserves JSX for Metro/Babel). For
    // Jest we transform JSX with the classic runtime so Node can execute it.
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react' } }],
  },
};
