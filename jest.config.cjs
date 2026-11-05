module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.test.[jt]s?(x)'],
  moduleNameMapper: {
    '^@deepseek-ai/dsh-api-session-controller/client$': '<rootDir>/node_modules/@deepseek-ai/dsh-api-session-controller/lib/types/client/index.js',
    '^@deepseek-ai/dsh-api-workspace-controller/client$': '<rootDir>/node_modules/@deepseek-ai/dsh-api-workspace-controller/lib/types/client/index.js',
    '^@deepseek-ai/dsh-client-file-upload/client$': '<rootDir>/node_modules/@deepseek-ai/dsh-client-file-upload/lib/types/client/index.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@deepseek-ai/.*|@standard-schema/.*|zod/.*|immer/.*|zustand/.*))',
  ],
};
