// Generic error message formatter for API errors
export const formatErrorMessage = (
  source: string,
  statusCode: number,
  errorData: any
): string => {
  let formattedMessage = `${source} - `;

  // Format based on status code
  if (statusCode === 401) {
    formattedMessage += "Authentication error. Please check your API key.";
  } else if (statusCode === 429) {
    formattedMessage += "Rate limit exceeded. Please try again later.";
  } else if (statusCode === 500 || statusCode === 503) {
    formattedMessage += "Service unavailable. The model might be overloaded or offline.";
  } else if (statusCode === 400) {
    formattedMessage += "Bad request. The input may be invalid.";
  } else {
    formattedMessage += `Error code ${statusCode}. ${getErrorDetails(errorData)}`;
  }

  return formattedMessage;
};

// Extract detailed error information from API responses
const getErrorDetails = (errorData: any): string => {
  if (!errorData) return "Unknown error";

  // Format based on common error response structures
  if (errorData.error) {
    if (typeof errorData.error === 'string') {
      return errorData.error;
    } else if (errorData.error.message) {
      return errorData.error.message;
    } else if (errorData.error.type) {
      return `Error type: ${errorData.error.type}`;
    }
  }

  if (errorData.message) {
    return errorData.message;
  }

  // Fallback to stringifying the error object
  try {
    return JSON.stringify(errorData);
  } catch (e) {
    return "Unable to parse error details";
  }
}; 