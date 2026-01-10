// Test setup file
// This file runs before all tests

// Mock environment variables
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jwt-signing';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./test.db';

// Suppress console logs during tests (optional - uncomment if needed)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };



