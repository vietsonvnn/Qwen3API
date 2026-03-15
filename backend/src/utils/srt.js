// =====================================================
// SRT SUBTITLE GENERATION
// Splits long TTS segments into subtitle-sized entries
// with CJK-aware text wrapping for YouTube mobile display.
// =====================================================

// =====================================================
// LANGUAGE / TEXT TYPE DETECTION
// =====================================================

const RANGES = {
  korean:   /[\uAC00-\uD7AF]/,
  japanese: /[\u3040-\u30FF\u31F0-\u31FF]/,  // Hiragana + Katakana
  cjk:     /[\u3000-\u9FFF\uF900-\uFAFF]/,   // CJK Unified + compat
};

/**
 * Detect dominant text type by sampling characters.
 * Returns 'korean' | 'japanese' | 'cjk' | 'latin'.
 */
export function detectTextType(text) {
  const counts = { korean: 0, japanese: 0, cjk: 0, latin: 0 };

  for (const ch of text) {
    if (RANGES.korean.test(ch))       counts.korean++;
    else if (RANGES.japanese.test(ch)) counts.japanese++;
    else if (RANGES.cjk.test(ch))     counts.cjk++;
    else if (/[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]/.test(ch)) counts.latin++;
    // ignore digits, punctuation, whitespace
  }

  // Pick the type with the highest count
  let max = 'latin';
  let maxCount = counts.latin;
  for (const [type, count] of Object.entries(counts)) {
    if (count > maxCount) { max = type; maxCount = count; }
  }
  return max;
}

// =====================================================
// CHARACTER LIMITS (YouTube mobile-safe)
// =====================================================

const CHARS_PER_LINE = {
  korean:   18,
  japanese: 16,
  cjk:     16,
  latin:   30,
};

/**
 * Max characters per subtitle line for a given text type.
 */
export function getMaxCharsPerLine(textType) {
  return CHARS_PER_LINE[textType] || CHARS_PER_LINE.latin;
}

// =====================================================
// TEXT WRAPPING
// =====================================================

// Japanese sentence / clause boundaries for splitting
const JP_SENTENCE_END = /[。！？]/;
const JP_CLAUSE_END   = /[、]/;
const JP_PARTICLES    = new Set(['は', 'が', 'を', 'に', 'で', 'と', 'も', 'の', 'へ', 'か', 'よ', 'ね']);

/**
 * Wrap text into at most `maxLines` lines, each up to `maxChars` characters.
 * Respects word boundaries for space-delimited languages and character /
 * clause boundaries for Japanese.
 */
export function wrapText(text, maxChars, maxLines = 2) {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;   // fits on one line

  const hasSpaces = /\s/.test(trimmed);
  const lines = [];

  if (hasSpaces) {
    // Space-delimited: Korean (has spaces), Latin, Vietnamese, etc.
    const words = trimmed.split(/\s+/);
    let line = '';

    for (const word of words) {
      if (lines.length >= maxLines) break;
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > maxChars && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }

    if (line && lines.length < maxLines) {
      lines.push(line);
    } else if (line && lines.length >= maxLines) {
      // Append leftover to last line (will be slightly over, but better than dropping)
      lines[lines.length - 1] += ' ' + line;
    }
  } else {
    // No spaces: Japanese / Chinese character-level wrapping
    let pos = 0;
    while (pos < trimmed.length && lines.length < maxLines) {
      const end = Math.min(pos + maxChars, trimmed.length);
      lines.push(trimmed.slice(pos, end));
      pos = end;
    }
  }

  return lines.join('\n');
}

// =====================================================
// SEGMENT SPLITTING
// =====================================================

/**
 * Find the best split point in CJK text (no spaces) near `target`.
 * Searches backward from `target` looking for natural boundaries.
 */
function findCjkSplitPoint(text, target) {
  // Search window: don't go further back than 30% of target
  const searchStart = Math.max(0, target - Math.floor(target * 0.3));

  // 1. Sentence endings (。！？)
  for (let i = target; i >= searchStart; i--) {
    if (JP_SENTENCE_END.test(text[i])) return i + 1;
  }
  // 2. Clause boundaries (、)
  for (let i = target; i >= searchStart; i--) {
    if (JP_CLAUSE_END.test(text[i])) return i + 1;
  }
  // 3. After particles
  for (let i = target; i >= searchStart; i--) {
    if (JP_PARTICLES.has(text[i]) && i + 1 < text.length) return i + 1;
  }
  // 4. Character boundary (last resort)
  return target;
}

/**
 * Find the best split point in space-delimited text near `target`.
 * Prefers splitting at a space boundary.
 */
function findSpaceSplitPoint(text, target) {
  // Search backward for a space
  for (let i = target; i >= Math.max(0, target - 15); i--) {
    if (/\s/.test(text[i])) return i + 1;
  }
  // Search forward for a space
  for (let i = target; i < Math.min(text.length, target + 10); i++) {
    if (/\s/.test(text[i])) return i + 1;
  }
  return target;
}

/**
 * Split a single TTS segment into multiple subtitle-sized entries.
 *
 * Input:  { text, startMs, endMs }
 * Output: [{ text, startMs, endMs }, ...]
 *
 * Each output entry has at most maxLines lines of maxCharsPerLine characters.
 */
export function splitSegmentIntoSubtitles(segment, options = {}) {
  const { maxLines = 2 } = options;
  const text = segment.text.trim();
  if (!text) return [];

  const textType = detectTextType(text);
  const maxCharsPerLine = getMaxCharsPerLine(textType);
  const chunkSize = maxCharsPerLine * maxLines;  // max chars per subtitle entry

  // If text is already short enough, just wrap and return
  if (text.length <= chunkSize) {
    return [{
      text: wrapText(text, maxCharsPerLine, maxLines),
      startMs: segment.startMs,
      endMs: segment.endMs,
    }];
  }

  // Split the text into chunks
  const hasSpaces = /\s/.test(text);
  const chunks = [];
  let pos = 0;

  while (pos < text.length) {
    if (text.length - pos <= chunkSize) {
      // Remaining text fits in one chunk
      chunks.push(text.slice(pos));
      break;
    }

    const target = pos + chunkSize;
    let splitAt;

    if (hasSpaces) {
      splitAt = findSpaceSplitPoint(text, target);
    } else {
      splitAt = findCjkSplitPoint(text, target);
    }

    // Safety: ensure forward progress
    if (splitAt <= pos) splitAt = pos + chunkSize;
    if (splitAt > text.length) splitAt = text.length;

    chunks.push(text.slice(pos, splitAt).trim());
    pos = splitAt;

    // Skip any leading whitespace at the new position
    while (pos < text.length && /\s/.test(text[pos])) pos++;
  }

  // Distribute time proportionally by character count
  const totalChars = chunks.reduce((sum, c) => sum + c.length, 0);
  const totalDuration = segment.endMs - segment.startMs;
  const entries = [];
  let curMs = segment.startMs;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk) continue;

    const proportion = chunk.length / totalChars;
    const durationMs = i === chunks.length - 1
      ? (segment.endMs - curMs)                       // last chunk gets remainder
      : Math.round(totalDuration * proportion);

    entries.push({
      text: wrapText(chunk, maxCharsPerLine, maxLines),
      startMs: curMs,
      endMs: curMs + durationMs,
    });
    curMs += durationMs;
  }

  return entries;
}

// =====================================================
// TIMESTAMP FORMATTING
// =====================================================

/**
 * Convert milliseconds to SRT timestamp string: HH:MM:SS,mmm
 */
export function msToSrtTime(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const ms2 = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms2).padStart(3, '0')}`;
}

// =====================================================
// MAIN: GENERATE SRT
// =====================================================

/**
 * Generate a complete SRT subtitle string from Qwen3 TTS segments.
 *
 * @param {Array<{text: string, startMs: number, endMs: number}>} segments
 * @returns {string} Standard SRT content
 */
export function generateSrt(segments) {
  if (!segments?.length) return '';

  const allEntries = [];

  for (const segment of segments) {
    const subs = splitSegmentIntoSubtitles(segment);
    allEntries.push(...subs);
  }

  return allEntries.map((entry, i) =>
    `${i + 1}\n${msToSrtTime(entry.startMs)} --> ${msToSrtTime(entry.endMs)}\n${entry.text}\n`
  ).join('\n');
}
