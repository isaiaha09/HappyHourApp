module.exports = {
  preset: 'jest-expo',
  setupFiles: ['./jest.setup.js'],
  setupFilesAfterEnv: ['./jest.afterEnv.js'],
  testMatch: ['**/?(*.)+(spec|test).[tj]s?(x)'],
};
