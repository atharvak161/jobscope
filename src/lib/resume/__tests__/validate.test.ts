/**
 * Unit tests for src/lib/resume/validate.ts
 *
 * Coverage:
 * - Valid PDF passes
 * - Valid DOCX passes
 * - Oversized file fails
 * - Path traversal filename fails (..  / \)
 * - Wrong MIME type fails
 * - Legacy .doc MIME gets friendly error message
 * - Empty filename fails
 * - Exactly at 10 MB limit passes
 * - One byte over limit fails
 */

import { validateResumeFile, ValidationResult } from '../validate';

const PDF_TYPE = 'application/pdf';
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOC_TYPE = 'application/msword';

const TEN_MB = 10 * 1024 * 1024;

describe('validateResumeFile', () => {
  // ── Valid cases ──────────────────────────────────────────────────────────

  it('accepts a valid PDF within size limit', () => {
    const result: ValidationResult = validateResumeFile({
      name: 'my-resume.pdf',
      size: 500_000,
      type: PDF_TYPE,
    });
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts a valid DOCX within size limit', () => {
    const result: ValidationResult = validateResumeFile({
      name: 'cv_atharva.docx',
      size: 1_200_000,
      type: DOCX_TYPE,
    });
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts a file exactly at the 10 MB limit', () => {
    const result = validateResumeFile({
      name: 'resume.pdf',
      size: TEN_MB,
      type: PDF_TYPE,
    });
    expect(result.valid).toBe(true);
  });

  // ── Size failures ────────────────────────────────────────────────────────

  it('rejects a file one byte over the 10 MB limit', () => {
    const result = validateResumeFile({
      name: 'resume.pdf',
      size: TEN_MB + 1,
      type: PDF_TYPE,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/10 MB/);
  });

  it('rejects an oversized DOCX', () => {
    const result = validateResumeFile({
      name: 'big-resume.docx',
      size: 20 * 1024 * 1024,
      type: DOCX_TYPE,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('MB');
  });

  // ── MIME type failures ───────────────────────────────────────────────────

  it('rejects an image file', () => {
    const result = validateResumeFile({
      name: 'photo.png',
      size: 50_000,
      type: 'image/png',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/PDF|docx/i);
  });

  it('rejects a plain text file', () => {
    const result = validateResumeFile({
      name: 'resume.txt',
      size: 10_000,
      type: 'text/plain',
    });
    expect(result.valid).toBe(false);
  });

  it('rejects legacy .doc with a friendly error message', () => {
    const result = validateResumeFile({
      name: 'old-resume.doc',
      size: 200_000,
      type: DOC_TYPE,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/docx/i);
    expect(result.error).toMatch(/PDF/i);
  });

  // ── Filename safety ──────────────────────────────────────────────────────

  it('rejects a filename containing ..', () => {
    const result = validateResumeFile({
      name: '../etc/passwd',
      size: 10_000,
      type: PDF_TYPE,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects a filename containing a forward slash', () => {
    const result = validateResumeFile({
      name: 'subdir/resume.pdf',
      size: 10_000,
      type: PDF_TYPE,
    });
    expect(result.valid).toBe(false);
  });

  it('rejects a filename containing a backslash', () => {
    const result = validateResumeFile({
      name: 'subdir\\resume.pdf',
      size: 10_000,
      type: PDF_TYPE,
    });
    expect(result.valid).toBe(false);
  });

  it('rejects a filename that is only whitespace', () => {
    const result = validateResumeFile({
      name: '   ',
      size: 10_000,
      type: PDF_TYPE,
    });
    expect(result.valid).toBe(false);
  });
});
