const sanitizeErrorMessage = (error, fallbackMessage = 'Something went wrong. Please try again later.') => {
  const value = typeof error === 'string' ? error : error?.message || error?.toString?.() || 'Unknown error';
  const message = String(value).trim();

  if (!message || message === 'Error') return fallbackMessage;

  if (
    /stack trace|traceback|at\s+/.test(message) ||
    /\/Users\//.test(message) ||
    /\/Applications\//.test(message) ||
    /\/home\//.test(message) ||
    /mongodb|mongoose|mongo|e11000|duplicate key|collection|connect/i.test(message) ||
    /cannot read properties|cannot set property|uncaught|exception/i.test(message)
  ) {
    return fallbackMessage;
  }

  if (message.length > 180) {
    return fallbackMessage;
  }

  return message;
};

const logError = (context, error) => {
  const details = error?.stack || error?.message || error || 'Unknown error';
  console.error(`[${context}]`, details);
};

const sendErrorResponse = (res, error, fallbackMessage = 'Something went wrong. Please try again later.', statusCode = 500, context = 'server') => {
  logError(context, error);
  const safeMessage = sanitizeErrorMessage(error) || fallbackMessage;
  return res.status(statusCode).json({ message: safeMessage });
};

module.exports = {
  sanitizeErrorMessage,
  logError,
  sendErrorResponse,
};
