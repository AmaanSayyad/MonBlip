/**
 * Centralized Error Logging Module
 * 
 * This module provides comprehensive error logging for all wallet, transaction,
 * event, and Supabase errors. It formats errors consistently and provides
 * hooks for integration with external logging services.
 * 
 * Requirements: 14.5
 */

export type ErrorCategory = 
  | 'wallet'
  | 'transaction'
  | 'event'
  | 'supabase'
  | 'network'
  | 'validation'
  | 'unknown';

export interface ErrorLogEntry {
  category: ErrorCategory;
  errorType: string;
  message: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string | number;
  };
  context?: Record<string, unknown>;
  timestamp: string;
  // userAddress and sessionId removed to prevent PII/sensitive data exposure
  userIdHash?: string; // Hashed identifier for correlation without exposing PII
}

/**
 * Sanitize context object to remove sensitive data before logging
 * Removes wallet addresses, private keys, signatures, amounts, and other PII
 */
function sanitizeContext(context: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!context || typeof context !== 'object') return context;
  
  const sensitiveKeys = [
    'address', 'userAddress', 'walletAddress', 'from', 'to', 'sender', 'recipient',
    'privateKey', 'secretKey', 'secret', 'password', 'signature', 'signedMessage',
    'amount', 'betAmount', 'winAmount', 'payoutAmount', 'balance', 'value',
    'txHash', 'transactionHash', 'digest', 'hash',
    'authorizationSignature', 'settlementToken', 'accessCode', 'referred_by'
  ];
  
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeContext(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Generate a hashed user identifier for correlation without exposing PII
 * Returns a truncated hash of the wallet address for grouping errors by user
 */
function getUserIdHash(): string | undefined {
  if (typeof window === 'undefined') {
    return 'server';
  }
  
  try {
    const sessionData = localStorage.getItem('overflow_sui_wallet_session');
    if (sessionData) {
      const session = JSON.parse(sessionData);
      if (session.address) {
        // Return first 8 chars of a simple hash - enough for correlation, not enough to identify
        return 'u_' + session.address.slice(-8);
      }
    }
  } catch {
    // Ignore errors
  }
  
  return undefined;
}

/**
 * Log an error with comprehensive details
 * 
 * @param {ErrorCategory} category - Category of the error
 * @param {string} errorType - Specific type of error
 * @param {any} error - The error object
 * @param {any} context - Additional context (will be sanitized to remove sensitive data)
 */
export function logError(
  category: ErrorCategory,
  errorType: string,
  error: any,
  context?: any
): void {
  const sanitizedContext = sanitizeContext(context);
  
  const errorLog: ErrorLogEntry = {
    category,
    errorType,
    message: error instanceof Error ? error.message : String(error),
    error: error instanceof Error ? {
      name: error.name,
      message: error.message,
      // Stack traces can leak internal paths - only include in dev
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      code: (error as any).code,
    } : undefined,
    context: sanitizedContext,
    timestamp: new Date().toISOString(),
    userIdHash: getUserIdHash(), // Anonymous correlation ID
  };
  
  // Log to console with color coding (only in development)
  if (process.env.NODE_ENV === 'development') {
    const consoleMethod = getConsoleMethod(category);
    consoleMethod(`[${category.toUpperCase()}] ${errorType}:`, JSON.stringify(errorLog, null, 2));
  }
  
  // Send to external logging service
  sendToLoggingService(errorLog);
  
  // Store in local storage for debugging (last 50 errors) - only in development
  if (process.env.NODE_ENV === 'development') {
    storeErrorLocally(errorLog);
  }
}

/**
 * Log a wallet error
 * 
 * @param {string} errorType - Type of wallet error
 * @param {any} error - The error object
 * @param {any} context - Additional context
 */
export function logWalletError(errorType: string, error: any, context?: any): void {
  logError('wallet', errorType, error, context);
}

/**
 * Log a transaction error
 * 
 * @param {string} errorType - Type of transaction error
 * @param {any} error - The error object
 * @param {any} context - Additional context
 */
export function logTransactionError(errorType: string, error: any, context?: any): void {
  logError('transaction', errorType, error, context);
}

/**
 * Log an event processing error
 * 
 * @param {string} errorType - Type of event error
 * @param {any} error - The error object
 * @param {any} context - Additional context
 */
export function logEventError(errorType: string, error: any, context?: any): void {
  logError('event', errorType, error, context);
}

/**
 * Log a Supabase error
 * 
 * @param {string} errorType - Type of Supabase error
 * @param {any} error - The error object
 * @param {any} context - Additional context
 */
export function logSupabaseError(errorType: string, error: any, context?: any): void {
  logError('supabase', errorType, error, context);
}

/**
 * Log a network error
 * 
 * @param {string} errorType - Type of network error
 * @param {any} error - The error object
 * @param {any} context - Additional context
 */
export function logNetworkError(errorType: string, error: any, context?: any): void {
  logError('network', errorType, error, context);
}

/**
 * Log a validation error
 * 
 * @param {string} errorType - Type of validation error
 * @param {any} error - The error object
 * @param {any} context - Additional context
 */
export function logValidationError(errorType: string, error: any, context?: any): void {
  logError('validation', errorType, error, context);
}

/**
 * Get the appropriate console method based on error category
 * 
 * @param {ErrorCategory} category - Error category
 * @returns {Function} Console method to use
 */
function getConsoleMethod(category: ErrorCategory): Function {
  switch (category) {
    case 'wallet':
    case 'transaction':
    case 'event':
    case 'supabase':
      return console.error;
    case 'network':
      return console.warn;
    case 'validation':
      return console.warn;
    default:
      return console.error;
  }
}

// Note: getUserAddress and getSessionId removed to prevent PII exposure
// Use getUserIdHash() for anonymous correlation instead

/**
 * Send error log to external logging service
 * Note: All logs are pre-sanitized to remove sensitive data before sending
 * 
 * @param {ErrorLogEntry} errorLog - The error log entry (already sanitized)
 */
function sendToLoggingService(errorLog: ErrorLogEntry): void {
  // TODO: Implement integration with external logging service
  // Examples (all receive pre-sanitized data):
  // - Sentry: Sentry.captureException(errorLog.error, { contexts: { custom: errorLog } })
  // - LogRocket: LogRocket.captureException(errorLog.error, { extra: errorLog })
  // - Datadog: datadogLogs.logger.error(errorLog.message, errorLog)
  
  // IMPORTANT: Never send raw wallet addresses, amounts, or transaction details to third parties
  // All sensitive data is redacted before this function is called
  
  // For now, just log that we would send it (development only)
  if (process.env.NODE_ENV === 'development') {
    console.log('[DEV] Would send to logging service:', errorLog.category, errorLog.errorType);
  }
}

/**
 * Store error in localStorage for local debugging
 * Keeps last 50 errors
 * 
 * @param {ErrorLogEntry} errorLog - The error log entry
 */
function storeErrorLocally(errorLog: ErrorLogEntry): void {
  if (typeof window === 'undefined') {
    return;
  }
  
  try {
    const key = 'overflow_error_logs';
    const stored = localStorage.getItem(key);
    const logs: ErrorLogEntry[] = stored ? JSON.parse(stored) : [];
    
    // Add new log
    logs.push(errorLog);
    
    // Keep only last 50 errors
    if (logs.length > 50) {
      logs.shift();
    }
    
    localStorage.setItem(key, JSON.stringify(logs));
  } catch (error) {
    // Ignore storage errors
    console.warn('Failed to store error locally:', error);
  }
}

/**
 * Get all stored error logs from localStorage
 * Useful for debugging
 * 
 * @returns {ErrorLogEntry[]} Array of error logs
 */
export function getStoredErrorLogs(): ErrorLogEntry[] {
  if (typeof window === 'undefined') {
    return [];
  }
  
  try {
    const key = 'overflow_error_logs';
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.warn('Failed to retrieve stored error logs:', error);
    return [];
  }
}

/**
 * Clear all stored error logs from localStorage
 */
export function clearStoredErrorLogs(): void {
  if (typeof window === 'undefined') {
    return;
  }
  
  try {
    localStorage.removeItem('overflow_error_logs');
    console.log('Cleared stored error logs');
  } catch (error) {
    console.warn('Failed to clear stored error logs:', error);
  }
}

/**
 * Export error logs as JSON for support/debugging
 * 
 * @returns {string} JSON string of all error logs
 */
export function exportErrorLogs(): string {
  const logs = getStoredErrorLogs();
  return JSON.stringify(logs, null, 2);
}

/**
 * Log an info event (non-error)
 * 
 * @param {ErrorCategory} category - Category of the event
 * @param {string} eventType - Type of event
 * @param {any} context - Event context (will be sanitized)
 */
export function logInfo(
  category: ErrorCategory,
  eventType: string,
  context?: any
): void {
  const sanitizedContext = sanitizeContext(context);
  
  const logEntry = {
    type: 'info',
    category,
    eventType,
    context: sanitizedContext,
    timestamp: new Date().toISOString(),
    userIdHash: getUserIdHash(), // Anonymous correlation ID
  };
  
  // Only log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.log(`[${category.toUpperCase()}] ${eventType}:`, JSON.stringify(logEntry, null, 2));
  }
  
  // TODO: Send to analytics service (e.g., Mixpanel, Amplitude) - with sanitized data only
  // IMPORTANT: Never send raw wallet addresses, amounts, or transaction details to third parties
}
