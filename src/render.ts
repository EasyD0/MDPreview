import * as vscode from 'vscode';
import type { PreviewConfig } from './config';

/** 一组 decoration 类型。配置变化时整体重建，所以需要显式 dispose。 */
export interface DecorationTypes {
  hidden: vscode.TextEditorDecorationType;
  bold: vscode.TextEditorDecorationType;
  italic: vscode.TextEditorDecorationType;
  boldItalic: vscode.TextEditorDecorationType;
  /** 下标 0 对应 h1，下标 5 对应 h6。 */
  headings: vscode.TextEditorDecorationType[];
  codeBlock: vscode.TextEditorDecorationType;
  codeInline: vscode.TextEditorDecorationType;
  quote: vscode.TextEditorDecorationType;
}

/** 行内标记符的解析结果：标记符区间 + 内容区间。 */
export interface InlineToken {
  kind: 'bold' | 'italic' | 'boldItalic' | 'code';
  openStart: number;
  openEnd: number;
  closeStart: number;
  closeEnd: number;
}

interface Buckets {
  hidden: vscode.Range[];
  bold: vscode.Range[];
  italic: vscode.Range[];
  boldItalic: vscode.Range[];
  headings: vscode.Range[][];
  codeBlock: vscode.Range[];
  codeInline: vscode.Range[];
  quote: vscode.Range[];
}

interface FenceState {
  char: string;
  length: number;
}

const MAX_NESTING = 4;
const WORD_CHAR = /[\p{L}\p{N}]/u;
const SPACE = /\s/;

export function createDecorationTypes(cfg: PreviewConfig): DecorationTypes {
  const headings = cfg.headings.map(style => vscode.window.createTextEditorDecorationType({
    color: style.color.length > 0 ? style.color : undefined,
    fontWeight: style.bold ? 'bold' : 'normal',
    fontStyle: style.italic ? 'italic' : 'normal',
  }));

  return {
    // textDecoration 里塞 display:none 是 VS Code 的非官方用法：官方 API 没有隐藏文本的能力。
    hidden: vscode.window.createTextEditorDecorationType({ textDecoration: 'none; display: none;' }),
    bold: vscode.window.createTextEditorDecorationType({ fontWeight: 'bold' }),
    italic: vscode.window.createTextEditorDecorationType({ fontStyle: 'italic' }),
    boldItalic: vscode.window.createTextEditorDecorationType({ fontWeight: 'bold', fontStyle: 'italic' }),
    headings,
    codeBlock: vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: cfg.codeBlockBackground,
    }),
    codeInline: vscode.window.createTextEditorDecorationType({
      backgroundColor: cfg.codeInlineBackground,
    }),
    quote: vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: cfg.quoteBackground,
    }),
  };
}

export function disposeDecorationTypes(types: DecorationTypes): void {
  types.hidden.dispose();
  types.bold.dispose();
  types.italic.dispose();
  types.boldItalic.dispose();
  for (const heading of types.headings) {
    heading.dispose();
  }
  types.codeBlock.dispose();
  types.codeInline.dispose();
  types.quote.dispose();
}

/**
 * 扫描一行里的行内标记（粗体 / 斜体 / 粗斜体 / 行内代码）。
 * 用一次顺序扫描处理，避免多个正则抢同一段文本。
 * 标记符的解析结果只给区间，不生成文本以外的内容。
 */
export function scanInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  scanRange(text, 0, text.length, tokens, 0);
  return tokens;
}

function scanRange(text: string, from: number, to: number, tokens: InlineToken[], depth: number): void {
  if (depth > MAX_NESTING) {
    return;
  }
  let i = from;
  while (i < to) {
    const ch = text[i];

    // 反斜杠转义：跳过被转义的那个字符
    if (ch === '\\') {
      i += 2;
      continue;
    }

    if (ch === '`') {
      const run = countRun(text, i, '`', to);
      const close = findCloser(text, i + run, '`', run, to, false);
      if (close < 0) {
        i += run;
        continue;
      }
      tokens.push({ kind: 'code', openStart: i, openEnd: i + run, closeStart: close, closeEnd: close + run });
      i = close + run;
      continue;
    }

    if (ch === '*' || ch === '_') {
      const run = Math.min(countRun(text, i, ch, to), 3);
      const contentStart = i + run;
      if (!canOpen(text, i, run, contentStart, to)) {
        i += run;
        continue;
      }

      // 连续的 *** 优先按粗斜体解析，解析不出来再退到粗体、斜体
      const lengths = run >= 3 ? [3, 2, 1] : run === 2 ? [2, 1] : [1];
      let matched = false;
      for (const len of lengths) {
        const close = findCloser(text, contentStart, ch, len, to, true);
        if (close < 0) {
          continue;
        }
        tokens.push({
          kind: len === 3 ? 'boldItalic' : len === 2 ? 'bold' : 'italic',
          openStart: i,
          openEnd: i + len,
          closeStart: close,
          closeEnd: close + len,
        });
        // 内容里可能还有嵌套标记，例如 **粗 *斜* 体**
        scanRange(text, contentStart, close, tokens, depth + 1);
        i = close + len;
        matched = true;
        break;
      }
      if (!matched) {
        i += run;
      }
      continue;
    }

    i += 1;
  }
}

function canOpen(text: string, start: number, run: number, contentStart: number, to: number): boolean {
  // 后面必须紧跟内容（所以 "* 列表项" 不会被当成斜体）
  if (contentStart >= to || isSpace(text[contentStart])) {
    return false;
  }
  // 下划线不做词内匹配，避免 snake_case_name 被拆掉
  if (text[start] === '_' && isWordChar(start > 0 ? text[start - 1] : '')) {
    return false;
  }
  return true;
}

/**
 * 从 from 开始找配对的收尾标记符，返回其起始下标，找不到返回 -1。
 * requireFlanking 为真时要求收尾标记符左边不是空白（内容不能以空白结尾），
 * 且下划线右边不能是词字符（CommonMark 的 flanking 规则）。
 */
function findCloser(
  text: string,
  from: number,
  ch: string,
  minLength: number,
  to: number,
  requireFlanking: boolean,
): number {
  let j = from;
  while (j < to) {
    if (text[j] !== ch) {
      j += 1;
      continue;
    }
    const run = countRun(text, j, ch, to);
    if (run >= minLength) {
      const before = j > 0 ? text[j - 1] : '';
      const after = j + run < to ? text[j + run] : '';
      const endsWithSpace = before === '' || isSpace(before);
      const intrawordUnderscore = ch === '_' && isWordChar(after);
      if (!requireFlanking || (!endsWithSpace && !intrawordUnderscore)) {
        return j;
      }
    }
    j += run;
  }
  return -1;
}

function countRun(text: string, start: number, ch: string, to: number): number {
  let end = start;
  while (end < to && text[end] === ch) {
    end += 1;
  }
  return end - start;
}

function isSpace(ch: string): boolean {
  return ch !== '' && SPACE.test(ch);
}

function isWordChar(ch: string): boolean {
  return ch !== '' && WORD_CHAR.test(ch);
}

/**
 * 重算某个编辑器里的全部 decoration。
 * 光标（或选区）所在行显示源码，其余行的标记符被隐藏。
 */
export function renderPreview(editor: vscode.TextEditor, types: DecorationTypes): void {
  const doc = editor.document;
  if (doc.languageId !== 'markdown') {
    return;
  }

  const activeLines = collectActiveLines(editor);
  const buckets = createBuckets();
  let fence: FenceState | undefined;

  for (let line = 0; line < doc.lineCount; line++) {
    const text = doc.lineAt(line).text;
    const showSource = activeLines.has(line);
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(text);

    // 围栏代码块：整块加背景，块内不做行内解析
    if (fence) {
      buckets.codeBlock.push(range(line, 0, text.length));
      if (fenceMatch && fenceMatch[1][0] === fence.char && fenceMatch[1].length >= fence.length) {
        fence = undefined;
      }
      continue;
    }
    if (fenceMatch) {
      fence = { char: fenceMatch[1][0], length: fenceMatch[1].length };
      buckets.codeBlock.push(range(line, 0, text.length));
      continue;
    }

    if (/^\s{0,3}>/.test(text)) {
      buckets.quote.push(range(line, 0, text.length));
    }

    const heading = /^(#{1,6})([ \t]+)(.*)$/.exec(text);
    if (heading) {
      const contentFrom = heading[1].length + heading[2].length;
      let contentTo = text.length;
      const closing = /[ \t]+#+[ \t]*$/.exec(text);
      if (closing && closing.index >= contentFrom) {
        contentTo = closing.index;
        if (!showSource) {
          buckets.hidden.push(range(line, closing.index, text.length));
        }
      }
      if (contentTo > contentFrom) {
        buckets.headings[heading[1].length - 1].push(range(line, contentFrom, contentTo));
      }
      if (!showSource) {
        buckets.hidden.push(range(line, 0, contentFrom));
      }
    }

    for (const token of scanInline(text)) {
      const styled = range(line, token.openEnd, token.closeStart);
      if (token.kind === 'bold') {
        buckets.bold.push(styled);
      } else if (token.kind === 'italic') {
        buckets.italic.push(styled);
      } else if (token.kind === 'boldItalic') {
        buckets.boldItalic.push(styled);
      } else {
        buckets.codeInline.push(styled);
      }
      if (!showSource) {
        buckets.hidden.push(range(line, token.openStart, token.openEnd));
        buckets.hidden.push(range(line, token.closeStart, token.closeEnd));
      }
    }
  }

  applyBuckets(editor, types, buckets);
}

function applyBuckets(editor: vscode.TextEditor, types: DecorationTypes, buckets: Buckets): void {
  editor.setDecorations(types.hidden, buckets.hidden);
  editor.setDecorations(types.bold, buckets.bold);
  editor.setDecorations(types.italic, buckets.italic);
  editor.setDecorations(types.boldItalic, buckets.boldItalic);
  editor.setDecorations(types.codeBlock, buckets.codeBlock);
  editor.setDecorations(types.codeInline, buckets.codeInline);
  editor.setDecorations(types.quote, buckets.quote);
  types.headings.forEach((type, level) => editor.setDecorations(type, buckets.headings[level]));
}

function createBuckets(): Buckets {
  return {
    hidden: [],
    bold: [],
    italic: [],
    boldItalic: [],
    headings: [[], [], [], [], [], []],
    codeBlock: [],
    codeInline: [],
    quote: [],
  };
}

function collectActiveLines(editor: vscode.TextEditor): Set<number> {
  const lines = new Set<number>();
  for (const selection of editor.selections) {
    for (let line = selection.start.line; line <= selection.end.line; line++) {
      lines.add(line);
    }
  }
  return lines;
}

function range(line: number, startCharacter: number, endCharacter: number): vscode.Range {
  return new vscode.Range(line, startCharacter, line, endCharacter);
}