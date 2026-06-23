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
  },
  transform: {
    // tsconfig uses `jsx: react-native` (preserves JSX for Metro/Babel). For
    // Jest we transform JSX with the classic runtime so Node can execute it.
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react' } }],
  },
};
