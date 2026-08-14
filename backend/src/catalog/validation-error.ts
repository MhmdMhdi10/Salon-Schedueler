/**
 * Represents a single field-level validation error.
 */
export interface FieldError {
  field: string;
  message: string;
}

/**
 * Structured validation error thrown when input fails Zod schema validation.
 * Contains field-level error details so clients can display errors per input.
 */
export class ValidationError extends Error {
  public readonly code = 'VALIDATION_ERROR';
  public readonly fieldErrors: FieldError[];

  constructor(fieldErrors: FieldError[]) {
    const summary = fieldErrors
      .map((e) => `${e.field}: ${e.message}`)
      .join('; ');
    super(`Validation failed: ${summary}`);
    this.name = 'ValidationError';
    this.fieldErrors = fieldErrors;
  }
}
