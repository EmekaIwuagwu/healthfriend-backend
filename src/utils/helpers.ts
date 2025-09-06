// Response helpers
export const createSuccessResponse = (data: any, message: string = 'Success') => {
  return {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  };
};

export const createErrorResponse = (message: string, error: string = 'ERROR') => {
  return {
    success: false,
    message,
    error,
    timestamp: new Date().toISOString()
  };
};

// Logging helpers (simple console.log for now)
export const logInfo = (message: string, data?: any) => {
  console.log(`[INFO] ${message}`, data || '');
};

export const logError = (message: string, error?: any) => {
  console.error(`[ERROR] ${message}`, error || '');
};

export const logWarning = (message: string, data?: any) => {
  console.warn(`[WARN] ${message}`, data || '');
};

// Pagination helpers
export const calculatePagination = (page: number, limit: number, total: number) => {
  const totalPages = Math.ceil(total / limit);
  return {
    currentPage: page,
    totalPages,
    totalItems: total,
    itemsPerPage: limit,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1
  };
};

export const getPaginationQuery = (page: number, limit: number) => {
  const skip = (page - 1) * limit;
  return { skip, limit };
};

// User sanitization (remove sensitive fields)
export const sanitizeUser = (user: any) => {
  const { signature, nonce, ...sanitized } = user;
  return sanitized;
};