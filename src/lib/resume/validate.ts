/**
 * Resume file validation
 * Security requirements: MIME type enforcement, size limit, path traversal prevention
 * Ref: JOBSCOPE_ARCHITECTURE.md §6.6
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const ALLOWED_MIME_TYPES: Record<string, true> = {
  'application/pdf': true,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true,
};

/** DOC (legacy Word binary) is rejected with a user-friendly message */
const LEGACY_WORD_MIME = 'application/msword';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Validates a resume file before it is stored or processed.
 *
 * Rules:
 * - Allowed MIME types: application/pdf and .docx (OOXML)
 * - application/msword (.doc legacy format) is rejected with a friendly message
 * - Max size: 10 MB
 * - Filename must not contain path traversal characters (.., /, \)
 */
export function validateResumeFile(file: {
  name: string;
  size: number;
  type: string;
}): ValidationResult {
  const { name, size, type } = file;

  // Filename safety — path traversal prevention
  if (name.includes('..') || name.includes('/') || name.includes('\\')) {
    return { valid: false, error: 'Invalid filename.' };
  }

  // Empty or blank filename
  if (!name.trim()) {
    return { valid: false, error: 'Filename is required.' };
  }

  // Legacy .doc format — friendly rejection
  if (type === LEGACY_WORD_MIME) {
    return {
      valid: false,
      error: 'Please use PDF or .docx format. Legacy .doc files are not supported.',
    };
  }

  // MIME type check
  if (!ALLOWED_MIME_TYPES[type]) {
    return {
      valid: false,
      error: 'Only PDF and .docx files are accepted.',
    };
  }

  // Size check
  if (size > MAX_FILE_SIZE_BYTES) {
    const maxMb = MAX_FILE_SIZE_BYTES / (1024 * 1024);
    return {
      valid: false,
      error: `File size must not exceed ${maxMb} MB.`,
    };
  }

  return { valid: true };
}
