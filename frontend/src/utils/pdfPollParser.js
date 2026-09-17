import { loadPdfjs } from "./lazyLibraries";

const Y_TOLERANCE = 4;
const INDENT_THRESHOLD = 18;

const QUESTION_PATTERNS = [
  /^(?:Q(?:uestion)?\.?\s*)?(\d{1,3})[.)]\s*(.+)$/i,
  /^(?:Q(?:uestion)?\.?\s*)(\d{1,3})\s*[:–-]\s*(.+)$/i,
  /^(\d{1,3})\s*[):]\s*(.+)$/,
];

const OPTION_PATTERNS = [
  { re: /^\(?([a-dA-D])\)?[.)]\s*(.+)$/, group: 2 },
  { re: /^\(?([ivxIVX]{1,4})\)?[.)]\s*(.+)$/, group: 2 },
  { re: /^[-•*○●◦▪▫☐☑✓]\s*(.+)$/, group: 1 },
  { re: /^\((\d{1,2})\)\s*(.+)$/, group: 2 },
  { re: /^(\d{1,2})[.)]\s+(.+)$/, group: 2, nested: true },
  { re: /^(?:Option\s+)?([A-D])[.:]\s*(.+)$/i, group: 2 },
  { re: /^(Yes|No|Maybe|Other|N\/A|None of the above)\s*$/i, group: 1 },
];

const HEADER_KEYWORDS =
  /^(survey|questionnaire|feedback\s*form|employee\s*(survey|feedback)|poll|assessment|instructions?|please\s+(read|answer|complete)|note[s]?:|section\s*\d|part\s*[a-z\d]|confidential|internal\s+use)/i;

const INSTRUCTION_LINE =
  /^(please|note|instruction|fill|select|choose|tick|mark|circle|check)\b/i;

const INLINE_OPTION_SPLIT =
  /(?=\s*\(?[a-dA-D]\)?[.)]\s*|\s*\(\d{1,2}\)\s*|\s+[-•*○●]\s*)/g;

function getFontSize(item) {
  const t = item.transform || [];
  return Math.max(Math.abs(t[0] || 0), Math.abs(t[3] || 0), item.height || 12);
}

function getX(item) {
  return item.transform?.[4] ?? 0;
}

function getY(item) {
  return item.transform?.[5] ?? 0;
}

/**
 * Rebuild reading-order lines from PDF.js text items using x/y positions.
 */
function itemsToLines(items) {
  const filtered = items.filter((i) => i.str && i.str.trim());
  if (!filtered.length) return [];

  filtered.sort((a, b) => {
    const yDiff = getY(b) - getY(a);
    if (Math.abs(yDiff) > Y_TOLERANCE) return yDiff;
    return getX(a) - getX(b);
  });

  const lines = [];
  let bucket = [];
  let bucketY = getY(filtered[0]);

  const flushBucket = () => {
    if (!bucket.length) return;
    bucket.sort((a, b) => getX(a) - getX(b));
    const text = bucket.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
    const fontSize = bucket.reduce((s, i) => s + getFontSize(i), 0) / bucket.length;
    const x = Math.min(...bucket.map(getX));
    const y = bucketY;
    if (text) lines.push({ text, fontSize, x, y });
    bucket = [];
  };

  for (const item of filtered) {
    const y = getY(item);
    if (Math.abs(y - bucketY) > Y_TOLERANCE) {
      flushBucket();
      bucketY = y;
    }
    bucket.push(item);
  }
  flushBucket();

  return lines;
}

async function extractLinesFromPdf(file) {
  const pdfjs = await loadPdfjs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const allLines = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageLines = itemsToLines(content.items);
    allLines.push(...pageLines);
  }

  return allLines;
}

function median(nums) {
  if (!nums.length) return 12;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function isAllCapsLine(text) {
  const letters = text.replace(/[^a-zA-Z]/g, "");
  return letters.length >= 4 && letters === letters.toUpperCase();
}

function matchQuestion(text) {
  for (const re of QUESTION_PATTERNS) {
    const m = text.match(re);
    if (m) {
      const body = (m[2] || m[m.length - 1] || "").trim();
      if (body.length >= 3) return { number: Number(m[1]), text: body };
    }
  }
  if (text.endsWith("?") && text.length >= 8 && !parseOption(text)) {
    return { number: null, text: text.trim() };
  }
  return null;
}

function parseOption(text, { allowNestedNumber = false, inQuestion = false } = {}) {
  const trimmed = text.trim();
  for (const { re, group, nested } of OPTION_PATTERNS) {
    if (nested && !allowNestedNumber && !inQuestion) continue;
    const m = trimmed.match(re);
    if (m && m[group]) {
      const opt = m[group].trim();
      if (opt.length >= 1 && opt.length <= 200) return opt;
    }
  }

  if (inQuestion) {
    const letterTight = trimmed.match(/^\(?([a-dA-D])\)?[.)](.+)$/);
    if (letterTight?.[2]?.trim()) return letterTight[2].trim();

    const numOpt = trimmed.match(/^(\d{1,2})[.)]\s+(.+)$/);
    if (numOpt && Number(numOpt[1]) <= 15) return numOpt[2].trim();
  }

  return null;
}

function isOptionByIndent(line, questionX, bodyFontSize) {
  if (questionX == null) return false;
  const indent = line.x - questionX;
  if (indent >= INDENT_THRESHOLD) return true;
  if (line.fontSize < bodyFontSize * 0.95 && parseOption(line.text)) return true;
  return false;
}

function isLikelyHeader(line, bodyFontSize, hasSeenQuestion) {
  const { text, fontSize } = line;
  if (!text || text.length > 120) return false;
  if (hasSeenQuestion) return false;
  if (matchQuestion(text)) return false;
  if (parseOption(text)) return false;
  if (INSTRUCTION_LINE.test(text) && !text.endsWith("?")) return true;
  if (HEADER_KEYWORDS.test(text)) return true;
  if (fontSize >= bodyFontSize * 1.2 && text.length < 80) return true;
  if (isAllCapsLine(text) && text.length < 80) return true;
  if (!text.endsWith("?") && fontSize >= bodyFontSize * 1.1 && text.split(/\s+/).length <= 8) {
    return true;
  }
  return false;
}

function isSkippableLine(text) {
  if (!text || text.length < 2) return true;
  if (/^page\s+\d+/i.test(text)) return true;
  if (/^\d+\s*\/\s*\d+$/.test(text)) return true;
  if (/^_+$/.test(text)) return true;
  return false;
}

function splitInlineOptions(text) {
  const parts = text.split(INLINE_OPTION_SPLIT).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return { questionPart: text, options: [] };

  const questionPart = parts[0];
  const options = [];
  for (let i = 1; i < parts.length; i++) {
    const opt = parseOption(parts[i], { allowNestedNumber: true }) || parts[i].trim();
    if (opt && opt.length >= 1) options.push(opt);
  }
  return { questionPart, options };
}

function extractQuestionText(raw) {
  const q = matchQuestion(raw);
  if (q) return q.text;
  return raw.trim();
}

function flushQuestion(current, questions) {
  if (!current?.text?.trim()) return;

  const text = current.text.trim();
  const uniqueOptions = [...new Set(current.options.map((o) => o.trim()).filter(Boolean))];

  if (uniqueOptions.length >= 2) {
    questions.push({
      text,
      type: "multiple_choice",
      options: uniqueOptions,
      allowMultiple: Boolean(current.allowMultiple),
    });
  } else {
    questions.push({
      text,
      type: "text",
      options: [],
      allowMultiple: false,
    });
  }
}

/**
 * Parse structured PDF lines into poll questions.
 */
function parseQuestionsFromLines(lines) {
  if (!lines?.length) return [];

  const bodyFontSize = median(lines.map((l) => l.fontSize));
  const questions = [];
  let current = null;
  let hasSeenQuestion = false;
  let questionBaseX = null;

  const startQuestion = (rawText, lineX) => {
    const { questionPart, options } = splitInlineOptions(rawText);
    const text = extractQuestionText(questionPart);
    current = {
      text,
      options: [...options],
      allowMultiple: /select\s+all|multiple|check\s+all/i.test(rawText),
    };
    questionBaseX = lineX;
    hasSeenQuestion = true;
  };

  for (const line of lines) {
    let { text } = line;
    if (isSkippableLine(text)) continue;

    if (!hasSeenQuestion && isLikelyHeader(line, bodyFontSize, hasSeenQuestion)) {
      continue;
    }

    const qMatch = matchQuestion(text);
    if (qMatch) {
      flushQuestion(current, questions);
      startQuestion(text, line.x);
      continue;
    }

    const opt = parseOption(text, { inQuestion: Boolean(current) });
    const optByIndent = isOptionByIndent(line, questionBaseX, bodyFontSize);

    if (current && (opt || optByIndent)) {
      const optionText = opt || text.trim();
      if (optionText && !matchQuestion(optionText)) {
        current.options.push(optionText);
      }
      continue;
    }

    if (current) {
      if (
        INSTRUCTION_LINE.test(text) &&
        !text.endsWith("?") &&
        current.options.length === 0
      ) {
        continue;
      }

      if (text.endsWith("?") && current.options.length === 0) {
        flushQuestion(current, questions);
        current = null;
        startQuestion(text, line.x);
        continue;
      }

      if (current.options.length === 0) {
        current.text += ` ${text}`;
      }
      continue;
    }

    if (text.endsWith("?") && text.length >= 8) {
      startQuestion(text, line.x);
    }
  }

  flushQuestion(current, questions);

  return postProcessQuestions(questions, lines);
}

/**
 * Second pass: attach orphan option lines & drop header-like false positives.
 */
function postProcessQuestions(questions, lines) {
  const cleaned = questions.filter((q) => {
    if (HEADER_KEYWORDS.test(q.text) && !q.text.endsWith("?")) return false;
    if (isAllCapsLine(q.text) && q.options.length === 0 && !q.text.endsWith("?")) {
      return false;
    }
    if (INSTRUCTION_LINE.test(q.text) && q.options.length === 0) return false;
    if (q.text.length < 3) return false;
    return true;
  });

  return cleaned.map((q) => {
    if (q.type === "text" && q.options.length >= 2) {
      return { ...q, type: "multiple_choice" };
    }
    if (q.type === "multiple_choice" && q.options.length < 2) {
      return { ...q, type: "text", options: [] };
    }
    return q;
  });
}

/**
 * Re-scan lines between questions to recover options missed in the first pass.
 */
function enrichQuestionsFromLines(questions, lines) {
  if (!questions.length || !lines.length) return questions;

  const bodyFontSize = median(lines.map((l) => l.fontSize));

  return questions.map((q) => {
    if (q.type === "multiple_choice" && q.options.length >= 2) return q;

    const needle = q.text.slice(0, Math.min(40, q.text.length)).toLowerCase();
    let startIdx = lines.findIndex((l) => {
      const t = l.text.toLowerCase();
      return t.includes(needle) || extractQuestionText(l.text).toLowerCase() === q.text.toLowerCase();
    });
    if (startIdx < 0) return q;

    const questionX = lines[startIdx].x;
    const collected = [...q.options];

    for (let i = startIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      const { text } = line;

      if (isSkippableLine(text)) continue;
      if (matchQuestion(text)) break;
      if (text.endsWith("?") && text.length > 15 && !parseOption(text, { inQuestion: true })) break;

      const opt =
        parseOption(text, { inQuestion: true }) ||
        (isOptionByIndent(line, questionX, bodyFontSize) ? text.trim() : null);

      if (opt && !matchQuestion(opt)) {
        collected.push(opt);
      } else if (collected.length > 0) {
        break;
      }
    }

    const unique = [...new Set(collected.map((o) => o.trim()).filter(Boolean))];
    if (unique.length >= 2) {
      return { ...q, type: "multiple_choice", options: unique };
    }
    return q;
  });
}

/**
 * Fallback: parse flat text when line reconstruction yields poor results.
 */
function parseQuestionsFromText(rawText) {
  const pseudoLines = rawText
    .split(/\n+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text, i) => ({ text, fontSize: 12, x: 0, y: i * 20 }));

  const fromLines = parseQuestionsFromLines(pseudoLines);
  if (fromLines.length > 0) return fromLines;

  const chunks = rawText
    .split(/(?=(?:\n|^)\s*(?:\d{1,3}[.)]\s|Q\d+[.:]\s))/i)
    .map((c) => c.trim())
    .filter((c) => c.length > 5);

  const questions = [];
  for (const chunk of chunks) {
    const lines = chunk.split(/\n/).map((l) => l.trim()).filter(Boolean);
    const first = lines[0] || chunk;
    const { questionPart, options: inlineOpts } = splitInlineOptions(first);
    const text = extractQuestionText(questionPart);
    const restOpts = lines.slice(1).map((l) => parseOption(l)).filter(Boolean);
    const allOpts = [...inlineOpts, ...restOpts];

    if (text.length >= 3) {
      questions.push({
        text,
        type: allOpts.length >= 2 ? "multiple_choice" : "text",
        options: allOpts.length >= 2 ? allOpts : [],
        allowMultiple: false,
      });
    }
  }

  return questions;
}

/**
 * Full pipeline: PDF file → parsed question list (session memory only).
 */
export async function parseQuestionsFromPdf(file) {
  const lines = await extractLinesFromPdf(file);
  let questions = parseQuestionsFromLines(lines);
  questions = enrichQuestionsFromLines(questions, lines);

  if (questions.length === 0) {
    const flat = lines.map((l) => l.text).join("\n");
    questions = parseQuestionsFromText(flat);
    questions = enrichQuestionsFromLines(questions, lines);
  }

  return questions;
}

