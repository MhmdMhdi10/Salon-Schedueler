module.exports = {
  default: {
    paths: ['features/tests/**/*.feature'],
    requireModule: ['ts-node/register/transpile-only'],
    require: [
      'features/bootstrap/custom.world.ts',
      'features/bootstrap/hooks.ts',
      'features/step_definitions/**/*.ts',
    ],
    format: [
      'progress',
      'json:artifacts/cucumber-results.json',
      'html:artifacts/cucumber-report.html',
    ],
    formatOptions: { snippetInterface: 'async-await' },
    parallel: 1,
    timeout: 120000,
    retry: 0,
    failFast: false,
    strict: true,
    tags: 'not @skip',
  },
};
