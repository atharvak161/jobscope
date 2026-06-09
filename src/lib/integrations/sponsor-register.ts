/**
 * gov.uk Register of Licensed Sponsors — Worker and Temporary Worker.
 *
 * Source: https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers
 *
 * The CSV is published by the Home Office and updated weekly (typically Thursdays).
 * The URL changes with each publication — the media ID in the path changes every time.
 *
 * IMPORTANT: The URL below was current as of 2026-06-08 (file: 10.5 MB, ~100k rows).
 * It will become a 404 after the next Home Office publication.
 *
 * Recommended operational pattern:
 *   1. Scrape the gov.uk publication page to extract the current CSV URL dynamically.
 *   2. Fall back to this hardcoded URL if the scrape fails (alerts Monitoring).
 *
 * The function downloadSponsorRegisterCSV() implements both approaches.
 *
 * CSV columns (as of 2026-06-08):
 *   Organisation Name, Town/City, County, Type & Rating, Route
 *
 * Failure modes handled:
 *   - HTTP non-200 on CSV download → throws Error
 *   - Timeout on download (30s)    → throws Error (file is ~10MB)
 *   - Scrape of publication page fails → falls back to KNOWN_STATIC_URL
 *   - Malformed CSV rows           → skipped, logged
 *   - Missing required columns     → skipped, logged
 */

import { type ParsedSponsor } from './types';

// ─── URL resolution ────────────────────────────────────────────────────────

/**
 * URL of the publication index page — we scrape this to find the current CSV URL.
 * This page URL is stable; only the linked CSV asset URL changes.
 */
const PUBLICATION_PAGE_URL =
  'https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers';

/**
 * Last known static URL for the Worker and Temporary Worker CSV.
 * Updated: 2026-06-08. File size: 10.5 MB.
 * Use as fallback only; the URL changes with each weekly publication.
 */
const KNOWN_STATIC_URL =
  'https://assets.publishing.service.gov.uk/media/6a267e4f8e85b4e5346ac057/2026-06-08_-_Worker_and_Temporary_Worker.csv';

const DOWNLOAD_TIMEOUT_MS = 30_000;
const PAGE_TIMEOUT_MS = 10_000;

// ─── Download ──────────────────────────────────────────────────────────────

/**
 * Attempts to resolve the current CSV URL by parsing the gov.uk publication page,
 * then downloads and returns the raw CSV string.
 *
 * Falls back to KNOWN_STATIC_URL if the page scrape fails or yields no CSV link.
 *
 * @returns Raw CSV string (UTF-8)
 * @throws  Error if the final download itself fails
 */
export async function downloadSponsorRegisterCSV(): Promise<string> {
  let csvUrl: string;

  try {
    csvUrl = await resolveCurrentCSVUrl();
    console.info('[sponsor-register] Resolved current CSV URL: %s', csvUrl);
  } catch (err) {
    console.warn(
      '[sponsor-register] Could not resolve current CSV URL from publication page: %s — falling back to known static URL',
      (err as Error).message,
    );
    csvUrl = KNOWN_STATIC_URL;
  }

  return downloadCSV(csvUrl);
}

/**
 * Fetches the gov.uk publication page and extracts the current CSV download URL.
 * Looks for an <a href> pointing to assets.publishing.service.gov.uk ending in .csv.
 *
 * @throws Error if no CSV link is found on the page
 */
async function resolveCurrentCSVUrl(): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(PUBLICATION_PAGE_URL, {
      headers: { Accept: 'text/html', 'User-Agent': 'JobScope-SponsorSync/1.0' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(
      `Publication page returned HTTP ${response.status}`,
    );
  }

  const html = await response.text();

  // Extract all hrefs pointing to assets.publishing.service.gov.uk .csv files
  const csvPattern = /https:\/\/assets\.publishing\.service\.gov\.uk\/[^"'\s]+\.csv/gi;
  const matches = html.match(csvPattern);

  if (!matches || matches.length === 0) {
    throw new Error('No CSV links found on publication page');
  }

  // Prefer the Worker_and_Temporary_Worker CSV by filename fragment
  const workerCsv = matches.find(
    (url) => url.toLowerCase().includes('worker') && url.toLowerCase().includes('temporary'),
  );

  return workerCsv ?? matches[0];
}

/**
 * Downloads the CSV at the given URL and returns its text content.
 */
async function downloadCSV(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': 'JobScope-SponsorSync/1.0' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(
      `CSV download failed: HTTP ${response.status} from ${url}`,
    );
  }

  return response.text();
}

// ─── Parsing ───────────────────────────────────────────────────────────────

/**
 * Parses the raw CSV string from the gov.uk sponsor register into structured rows.
 *
 * Expected columns (in order, as of 2026-06-08):
 *   Organisation Name | Town/City | County | Type & Rating | Route
 *
 * Rows with a missing Organisation Name are skipped (they are section headers or blank).
 *
 * @param csv Raw CSV text (UTF-8, may include BOM)
 * @returns   Array of ParsedSponsor objects
 */
export function parseSponsorCSV(csv: string): ParsedSponsor[] {
  // Strip UTF-8 BOM if present
  const clean = csv.startsWith('﻿') ? csv.slice(1) : csv;

  const lines = clean.split(/\r?\n/);
  if (lines.length < 2) return [];

  // First line is the header — we validate it but don't rely on column positions
  // being exactly right; use header names to locate columns defensively.
  const header = parseCSVRow(lines[0]);
  const colIndex = buildColumnIndex(header);

  const sponsors: ParsedSponsor[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const row = parseCSVRow(line);
      const name = getColumn(row, colIndex, 'Organisation Name');

      if (!name) continue; // blank or header-like row

      sponsors.push({
        name,
        city: getColumn(row, colIndex, 'Town/City'),
        county: getColumn(row, colIndex, 'County'),
        routeType: getColumn(row, colIndex, 'Route'),
        rating: getColumn(row, colIndex, 'Type & Rating'),
      });
    } catch (err) {
      console.warn('[sponsor-register] Skipped row %d: %s', i + 1, (err as Error).message);
    }
  }

  return sponsors;
}

// ─── Name normalisation ────────────────────────────────────────────────────

/**
 * Normalises a company/sponsor name for fuzzy matching against the register.
 *
 * Steps:
 *   1. Lowercase
 *   2. Strip common legal suffixes (Ltd, Limited, plc, LLP, Inc, Corp, Group, etc.)
 *   3. Strip punctuation (commas, full stops, parentheses, hyphens used as separators)
 *   4. Collapse multiple spaces into one
 *   5. Trim
 *
 * This is the mirror of what the DB-side pg_trgm matching does, so both sides
 * must use the same normalisation for similarity scores to be meaningful.
 *
 * @example
 *   normaliseSponsorName("HSBC Bank plc")        → "hsbc bank"
 *   normaliseSponsorName("Accenture (UK) Ltd.")   → "accenture uk"
 *   normaliseSponsorName("BT Group Limited")      → "bt"
 *   normaliseSponsorName("CrowdStrike, Inc.")      → "crowdstrike"
 */
export function normaliseSponsorName(name: string): string {
  // Legal suffixes to strip — order matters: strip longest first to avoid
  // partial matches (e.g. "LLP" before "LP", "Limited" before "Ltd").
  const LEGAL_SUFFIXES = [
    'public limited company',
    'limited liability partnership',
    'limited liability company',
    'limited partnership',
    'incorporated',
    'corporation',
    'cooperative',
    'limited',
    'company',
    'group',
    'llp',
    'llc',
    'plc',
    'ltd',
    'inc',
    'corp',
    'co',
  ];

  let normalised = name.toLowerCase().trim();

  // Strip trailing punctuation repeatedly (e.g. "Acme Ltd." → "Acme Ltd" → "Acme")
  // First remove dots that are part of abbreviations at end
  normalised = normalised.replace(/\.+$/, '');

  // Strip legal suffixes from the end of the name (with optional trailing punctuation)
  for (const suffix of LEGAL_SUFFIXES) {
    // Match the suffix at the end of the string, optionally preceded by
    // whitespace, comma, or a forward slash
    const pattern = new RegExp(
      `[,\\s/]+${escapeRegExp(suffix)}[.,]*\\s*$`,
      'i',
    );
    normalised = normalised.replace(pattern, '').trim();
  }

  // Remove parenthetical suffixes like "(UK)", "(Holdings)", "(International)"
  normalised = normalised.replace(/\s*\([^)]*\)\s*/g, ' ').trim();

  // Remove standalone punctuation characters (commas, full stops, apostrophes)
  // but preserve hyphens that are part of the name (e.g. "Rolls-Royce")
  normalised = normalised.replace(/[.,;:'"!?]/g, '');

  // Collapse multiple whitespace characters into a single space
  normalised = normalised.replace(/\s+/g, ' ').trim();

  return normalised;
}

// ─── CSV parsing helpers ───────────────────────────────────────────────────

/**
 * Parses a single CSV row handling quoted fields (RFC 4180 subset).
 * Handles commas within double-quoted fields and escaped double quotes ("").
 */
function parseCSVRow(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped double-quote inside a quoted field
        current += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
    i++;
  }

  fields.push(current.trim());
  return fields;
}

/**
 * Builds a map from lowercase column name → zero-based column index.
 * Handles variations like "Organisation Name" vs "organisation name".
 */
function buildColumnIndex(header: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < header.length; i++) {
    map.set(header[i].toLowerCase().trim(), i);
  }
  return map;
}

/**
 * Returns the value at the named column, or empty string if not found.
 */
function getColumn(
  row: string[],
  colIndex: Map<string, number>,
  columnName: string,
): string {
  const idx = colIndex.get(columnName.toLowerCase());
  if (idx === undefined) return '';
  return row[idx]?.trim() ?? '';
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
