// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Polyfill fetch for Node.js test environment
import fetch from 'cross-fetch'
global.fetch = fetch

// Polyfill Request and Response for Next.js API routes
import { Request, Response, Headers } from 'node-fetch'
global.Request = Request
global.Response = Response
global.Headers = Headers

// Polyfill TextEncoder and TextDecoder for Node.js test environment
import { TextEncoder, TextDecoder } from 'util'
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

// Set up test environment variables for Supabase
// These should be overridden with real values in .env for actual testing
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key'

// Route tests invoke handlers without x-monblip-balance-key unless a suite sets this explicitly.
delete process.env.BALANCE_INTERNAL_SECRET
process.env.BALANCE_SETTLEMENT_SECRET = process.env.BALANCE_SETTLEMENT_SECRET || 'test-settlement-secret'
