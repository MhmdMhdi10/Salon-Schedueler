/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@salon/shared$': '<rootDir>/../shared/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
