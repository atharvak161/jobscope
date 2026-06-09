/**
 * Resume text extraction
 * PDF  → pdf-parse (Node-native, no Python dependency)
 * DOCX → mammoth   (Node-native)
 *
 * Ref: JOBSCOPE_ARCHITECTURE.md §4 (Text Extraction step)
 * Note: ADR-003 originally specified pdfplumber/python-docx; this implementation
 *       uses Node-native equivalents per Phase 3 constraint (Next.js 16 runtime).
 */

import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

/** Typed error for extraction failures — callers can distinguish from other errors */
export class ExtractionError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ExtractionError';
  }
}

/** Collapse runs of whitespace / blank lines into a single space or newline */
function normaliseWhitespace(text: string): string {
  // Replace Windows-style line endings
  let result = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Collapse 3+ consecutive blank lines to 2
  result = result.replace(/\n{3,}/g, '\n\n');
  // Collapse runs of spaces/tabs on a single line to one space
  result = result.replace(/[ \t]{2,}/g, ' ');
  return result.trim();
}

/**
 * Extract plain text from a PDF buffer.
 * Uses pdf-parse v2 class-based API: PDFParse({ data }) → getText()
 * Throws ExtractionError on failure.
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    // TextResult.text is the full concatenated document text
    const text = result.text ?? '';
    if (!text) {
      throw new ExtractionError('PDF produced no extractable text. The file may be image-only or protected.');
    }
    return normaliseWhitespace(text);
  } catch (err) {
    if (err instanceof ExtractionError) throw err;
    throw new ExtractionError(
      `Failed to extract text from PDF: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }
}

/**
 * Extract plain text from a DOCX buffer.
 * Throws ExtractionError on failure.
 */
export async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    if (result.messages && result.messages.length > 0) {
      // Log warnings but do not fail — mammoth may produce partial output
      const warnings = result.messages.filter((m) => m.type === 'error');
      if (warnings.length > 0) {
        console.warn('[extract] mammoth reported errors:', warnings.map((w) => w.message));
      }
    }
    if (!result.value) {
      throw new ExtractionError('DOCX produced no extractable text.');
    }
    return normaliseWhitespace(result.value);
  } catch (err) {
    if (err instanceof ExtractionError) throw err;
    throw new ExtractionError(
      `Failed to extract text from DOCX: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }
}

/**
 * Route to the correct extractor based on MIME type.
 * Supported: application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document
 * Throws ExtractionError for unsupported types or extraction failures.
 */
export async function extractResumeText(buffer: Buffer, mimeType: string): Promise<string> {
  switch (mimeType) {
    case 'application/pdf':
      return extractTextFromPDF(buffer);
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return extractTextFromDOCX(buffer);
    default:
      throw new ExtractionError(`Unsupported MIME type for text extraction: ${mimeType}`);
  }
}
