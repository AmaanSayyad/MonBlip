/**
 * Unit tests for POST /api/balance/payout endpoint
 * 
 * Task: 4.5 Create POST /api/balance/payout endpoint
 * Requirements: 4.1, 4.2
 */

import { POST } from '../route';
import { supabaseService } from '@/lib/supabase/serviceClient';
import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const TEST_USER = '0x1111111111111111111111111111111111111111';
const TEST_USER_B = '0x4444444444444444444444444444444444444444';

jest.mock('@/lib/bans/walletBan', () => ({
  isWalletGloballyBanned: jest.fn().mockResolvedValue(false),
}));

jest.mock('@/lib/supabase/serviceClient', () => ({
  supabaseService: {
    rpc: jest.fn(),
    from: jest.fn((table: string) => {
      const chainMethods = {
        select: jest.fn(() => chainMethods),
        eq: jest.fn(() => chainMethods),
        limit: jest.fn(() => Promise.resolve({ data: [], error: null })),
        insert: jest.fn(() => Promise.resolve({ error: null })),
      };
      // For payout_lock and payout duplicate checks
      if (table === 'balance_audit_log') {
        return {
          ...chainMethods,
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              eq: jest.fn(() => ({
                limit: jest.fn(() => Promise.resolve({ data: [], error: null })),
              })),
            })),
          })),
        };
      }
      return chainMethods;
    }),
  },
}));

// Mock NextResponse.json to return a proper Response object
jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');
  return {
    ...actual,
    NextResponse: {
      json: jest.fn((body: any, init?: ResponseInit) => {
        return {
          json: async () => body,
          status: init?.status || 200,
          headers: new Headers(init?.headers),
        };
      }),
    },
  };
});

describe('POST /api/balance/payout', () => {
  const mockRpc = supabaseService.rpc as jest.MockedFunction<typeof supabaseService.rpc>;
  const mockNextResponseJson = NextResponse.json as jest.MockedFunction<typeof NextResponse.json>;
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully process a payout and return new balance', async () => {
    // Mock successful stored procedure response
    const mockResult = {
      success: true,
      error: null,
      new_balance: 35.5,
    };

    mockRpc.mockResolvedValue({
      data: mockResult,
      error: null,
    } as any);

    // Create mock request with valid payout data
    const requestBody = {
      userAddress: TEST_USER,
      payoutAmount: 20.5,
      betId: 'bet_123456',
    };

    const request = new NextRequest('http://localhost:3000/api/balance/payout', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    // Call the endpoint
    const response = await POST(request);
    const json = await response.json();

    // Verify response
    expect(response.status).toBe(200);
    expect(json).toEqual({
      success: true,
      newBalance: 35.5,
    });

    // Verify stored procedure was called with correct parameters
    expect(mockRpc).toHaveBeenCalledWith('credit_balance_for_payout', {
      p_user_address: TEST_USER.toLowerCase(),
      p_payout_amount: 20.5,
      p_currency: 'BNB',
      p_bet_id: 'bet_123456',
    });
  });

  it('should create new user record for first payout', async () => {
    // Mock successful stored procedure response for new user
    const mockResult = {
      success: true,
      error: null,
      new_balance: 15.0,
    };

    mockRpc.mockResolvedValue({
      data: mockResult,
      error: null,
    } as any);

    // Create mock request
    const requestBody = {
      userAddress: TEST_USER_B,
      payoutAmount: 15.0,
      betId: 'bet_789',
    };

    const request = new NextRequest('http://localhost:3000/api/balance/payout', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    // Call the endpoint
    const response = await POST(request);
    const json = await response.json();

    // Verify response
    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.newBalance).toBe(15.0);
  });

  it('should return 400 for missing userAddress', async () => {
    // Create mock request with missing userAddress
    const requestBody = {
      payoutAmount: 20.5,
      betId: 'bet_123456',
    };

    const request = new NextRequest('http://localhost:3000/api/balance/payout', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    // Call the endpoint
    const response = await POST(request);
    const json = await response.json();

    // Verify response
    expect(response.status).toBe(400);
    expect(json).toEqual({
      error: 'Missing required fields: userAddress, payoutAmount, betId',
    });

    // Verify stored procedure was not called
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('should return 400 for missing payoutAmount', async () => {
    // Create mock request with missing payoutAmount
    const requestBody = {
      userAddress: TEST_USER,
      betId: 'bet_123456',
    };

    const request = new NextRequest('http://localhost:3000/api/balance/payout', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    // Call the endpoint
    const response = await POST(request);
    const json = await response.json();

    // Verify response
    expect(response.status).toBe(400);
    expect(json).toEqual({
      error: 'Missing required fields: userAddress, payoutAmount, betId',
    });

    // Verify stored procedure was not called
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('should return 400 for missing betId', async () => {
    // Create mock request with missing betId
    const requestBody = {
      userAddress: TEST_USER,
      payoutAmount: 20.5,
    };

    const request = new NextRequest('http://localhost:3000/api/balance/payout', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    // Call the endpoint
    const response = await POST(request);
    const json = await response.json();

    // Verify response
    expect(response.status).toBe(400);
    expect(json).toEqual({
      error: 'Missing required fields: userAddress, payoutAmount, betId',
    });

    // Verify stored procedure was not called
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('should return 400 for invalid address format', async () => {
    // Create mock request with invalid address (no 0x prefix)
    const requestBody = {
      userAddress: 'invalid123',
      payoutAmount: 20.5,
      betId: 'bet_123456',
    };

    const request = new NextRequest('http://localhost:3000/api/balance/payout', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    // Call the endpoint
    const response = await POST(request);
    const json = await response.json();

    // Verify response
    expect(response.status).toBe(400);
    expect(json).toEqual({
      error: 'Invalid wallet address format',
    });

    // Verify stored procedure was not called
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('should return 400 for zero payout amount', async () => {
    // Create mock request with zero amount
    const requestBody = {
      userAddress: TEST_USER,
      payoutAmount: 0,
      betId: 'bet_123456',
    };

    const request = new NextRequest('http://localhost:3000/api/balance/payout', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    // Call the endpoint
    const response = await POST(request);
    const json = await response.json();

    // Verify response
    expect(response.status).toBe(400);
    expect(json).toEqual({
      error: 'Payout amount must be greater than zero',
    });

    // Verify stored procedure was not called
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('should return 400 for negative payout amount', async () => {
    // Create mock request with negative amount
    const requestBody = {
      userAddress: TEST_USER,
      payoutAmount: -10.5,
      betId: 'bet_123456',
    };

    const request = new NextRequest('http://localhost:3000/api/balance/payout', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    // Call the endpoint
    const response = await POST(request);
    const json = await response.json();

    // Verify response
    expect(response.status).toBe(400);
    expect(json).toEqual({
      error: 'Payout amount must be greater than zero',
    });

    // Verify stored procedure was not called
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('should return 503 for database connection errors', async () => {
    // Mock database connection error
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'CONNECTION_ERROR', message: 'Connection failed' },
    } as any);

    // Create mock request
    const requestBody = {
      userAddress: TEST_USER,
      payoutAmount: 20.5,
      betId: 'bet_123456',
    };

    const request = new NextRequest('http://localhost:3000/api/balance/payout', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    // Call the endpoint
    const response = await POST(request);
    const json = await response.json();

    // Verify response
    expect(response.status).toBe(503);
    expect(json).toEqual({
      error: 'Service temporarily unavailable. Please try again.',
    });
  });

  it('should handle stored procedure errors', async () => {
    // Mock stored procedure returning error
    const mockResult = {
      success: false,
      error: 'Database constraint violation',
      new_balance: null,
    };

    mockRpc.mockResolvedValue({
      data: mockResult,
      error: null,
    } as any);

    // Create mock request
    const requestBody = {
      userAddress: TEST_USER,
      payoutAmount: 20.5,
      betId: 'bet_123456',
    };

    const request = new NextRequest('http://localhost:3000/api/balance/payout', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    // Call the endpoint
    const response = await POST(request);
    const json = await response.json();

    // Verify response
    expect(response.status).toBe(400);
    expect(json).toEqual({
      error: 'Database constraint violation',
    });
  });

  it('should handle unexpected errors gracefully', async () => {
    // Mock unexpected error
    mockRpc.mockRejectedValue(new Error('Unexpected error'));

    // Create mock request
    const requestBody = {
      userAddress: TEST_USER,
      payoutAmount: 20.5,
      betId: 'bet_123456',
    };

    const request = new NextRequest('http://localhost:3000/api/balance/payout', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    // Call the endpoint
    const response = await POST(request);
    const json = await response.json();

    // Verify response
    expect(response.status).toBe(500);
    expect(json).toEqual({
      error: 'An error occurred processing your request',
    });
  });

  it('should handle large payout amounts correctly', async () => {
    // Mock successful stored procedure response with large amount
    const mockResult = {
      success: true,
      error: null,
      new_balance: 1000000.12345678,
    };

    mockRpc.mockResolvedValue({
      data: mockResult,
      error: null,
    } as any);

    // Create mock request with large amount
    const requestBody = {
      userAddress: TEST_USER,
      payoutAmount: 999999.12345678,
      betId: 'bet_large',
    };

    const request = new NextRequest('http://localhost:3000/api/balance/payout', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    // Call the endpoint
    const response = await POST(request);
    const json = await response.json();

    // Verify response
    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.newBalance).toBe(1000000.12345678);
  });

  it('should handle small decimal payout amounts correctly', async () => {
    // Mock successful stored procedure response with small decimal
    const mockResult = {
      success: true,
      error: null,
      new_balance: 0.00000001,
    };

    mockRpc.mockResolvedValue({
      data: mockResult,
      error: null,
    } as any);

    // Create mock request with small decimal amount
    const requestBody = {
      userAddress: TEST_USER,
      payoutAmount: 0.00000001,
      betId: 'bet_small',
    };

    const request = new NextRequest('http://localhost:3000/api/balance/payout', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    // Call the endpoint
    const response = await POST(request);
    const json = await response.json();

    // Verify response
    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.newBalance).toBe(0.00000001);
  });

  it('should handle malformed JSON gracefully', async () => {
    // Create mock request with malformed JSON
    const request = new NextRequest('http://localhost:3000/api/balance/payout', {
      method: 'POST',
      body: 'not valid json',
    });

    // Call the endpoint
    const response = await POST(request);
    const json = await response.json();

    // Verify response
    expect(response.status).toBe(500);
    expect(json).toEqual({
      error: 'An error occurred processing your request',
    });

    // Verify stored procedure was not called
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('should verify audit log is created via stored procedure', async () => {
    // The stored procedure handles audit log creation internally
    // This test verifies the procedure is called with correct parameters
    const mockResult = {
      success: true,
      error: null,
      new_balance: 50.0,
    };

    mockRpc.mockResolvedValue({
      data: mockResult,
      error: null,
    } as any);

    // Create mock request
    const requestBody = {
      userAddress: TEST_USER,
      payoutAmount: 25.0,
      betId: 'bet_audit_test',
    };

    const request = new NextRequest('http://localhost:3000/api/balance/payout', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    // Call the endpoint
    await POST(request);

    // Verify stored procedure was called with bet ID
    // The procedure internally creates audit log with operation_type='bet_won'
    expect(mockRpc).toHaveBeenCalledWith('credit_balance_for_payout', {
      p_user_address: TEST_USER.toLowerCase(),
      p_payout_amount: 25.0,
      p_currency: 'BNB',
      p_bet_id: 'bet_audit_test',
    });
  });

  it('should handle multiple payouts for same user', async () => {
    // Mock successful stored procedure responses
    const mockResult1 = {
      success: true,
      error: null,
      new_balance: 25.0,
    };
    const mockResult2 = {
      success: true,
      error: null,
      new_balance: 50.0,
    };

    mockRpc
      .mockResolvedValueOnce({ data: mockResult1, error: null } as any)
      .mockResolvedValueOnce({ data: mockResult2, error: null } as any);

    // First payout
    const request1 = new NextRequest('http://localhost:3000/api/balance/payout', {
      method: 'POST',
      body: JSON.stringify({
        userAddress: TEST_USER,
        payoutAmount: 25.0,
        betId: 'bet_1',
      }),
    });

    const response1 = await POST(request1);
    const json1 = await response1.json();

    expect(response1.status).toBe(200);
    expect(json1.newBalance).toBe(25.0);

    // Second payout
    const request2 = new NextRequest('http://localhost:3000/api/balance/payout', {
      method: 'POST',
      body: JSON.stringify({
        userAddress: TEST_USER,
        payoutAmount: 25.0,
        betId: 'bet_2',
      }),
    });

    const response2 = await POST(request2);
    const json2 = await response2.json();

    expect(response2.status).toBe(200);
    expect(json2.newBalance).toBe(50.0);

    // Verify both calls were made
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it('should handle payout with bet amount multiplied by odds', async () => {
    // Simulate a winning bet: bet 10 FLOW at 2.5x odds = 25 FLOW payout
    const mockResult = {
      success: true,
      error: null,
      new_balance: 40.0, // Previous balance 15 + payout 25
    };

    mockRpc.mockResolvedValue({
      data: mockResult,
      error: null,
    } as any);

    // Create mock request with calculated payout
    const requestBody = {
      userAddress: TEST_USER,
      payoutAmount: 25.0, // 10 * 2.5
      betId: 'bet_odds_test',
    };

    const request = new NextRequest('http://localhost:3000/api/balance/payout', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    // Call the endpoint
    const response = await POST(request);
    const json = await response.json();

    // Verify response
    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.newBalance).toBe(40.0);
  });
});
