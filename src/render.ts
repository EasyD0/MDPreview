import * as vscode from 'vscode';
import type { PreviewConfig, TextStyle } from './config';

/** 一组 decoration 类型。配置变化时整体重建，所以需要显式 dispose。 */
export interface DecorationTypes {
  hidden: vscode.TextEditorDecorationType;
  /** 围栏行内容：保留行高，把文字涂透明。 */
  fenceHidden: vscode.TextEditorDecorationType;
  /** 围栏行首的 [copy] 提示。 */
  copyHint: vscode.TextEditorDecorationType;
  bold: vscode.TextEditorDecorationType;
  italic: vscode.TextEditorDecorationType;
  boldItalic: vscode.TextEditorDecorationType;
  /** 下标 0 对应 h1，下标 5 对应 h6。 */
  headings: vscode.TextEditorDecorationType[];
  /** 正文：标题、代码、引用之外的部分。 */
  body: vscode.TextEditorDecorationType;
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
  fenceHidden: vscode.Range[];
  copyHint: vscode.Range[];
  bold: vscode.Range[];
  italic: vscode.Range[];
  boldItalic: vscode.Range[];
  headings: vscode.Range[][];
  body: vscode.Range[];
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

/**
 * 把 TextStyle 转成 decoration 选项。
 * 空字符串表示「不设置」，交给编辑器主题；font 为 false 时不碰字重和字形，
 * 避免把代码块、引用块里本来就有的粗体覆盖掉。
 */
function styleOptions(style: TextStyle, wholeLine: boolean, font: boolean): vscode.DecorationRenderOptions {
  const options: vscode.DecorationRenderOptions = {};
  if (wholeLine) {
    options.isWholeLine = true;
  }
  if (style.color) {
    options.color = style.color;
  }
  if (style.backgroundColor) {
    options.backgroundColor = style.backgroundColor;
  }
  if (font) {
    options.fontWeight = style.bold ? 'bold' : 'normal';
    options.fontStyle = style.italic ? 'italic' : 'normal';
  }
  return options;
}

export function createDecorationTypes(cfg: PreviewConfig): DecorationTypes {
  const headings = cfg.headings.map(style => vscode.window.createTextEditorDecorationType(
    styleOptions(style, true, true),
  ));

  return {
    // textDecoration 里塞 display:none 是 VS Code 的非官方用法：官方 API 没有隐藏文本的能力。
    hidden: vscode.window.createTextEditorDecorationType({ textDecoration: 'none; display: none;' }),
    // 围栏行不能也用 display:none：before 内容可能和文本共用或嵌套同一个 span，会一起消失。
    // 涂透明既保住了行高，也不影响 [copy] 的显示。
    fenceHidden: vscode.window.createTextEditorDecorationType({
      textDecoration: 'none; color: transparent !important;',
    }),
    copyHint: vscode.window.createTextEditorDecorationType({
      before: {
        contentText: '[copy]',
        color: new vscode.ThemeColor('editorCodeLens.foreground'),
        margin: '0 0.8em 0 0',
      },
    }),
    bold: vscode.window.createTextEditorDecorationType({ fontWeight: 'bold' }),
    italic: vscode.window.createTextEditorDecorationType({ fontStyle: 'italic' }),
    boldItalic: vscode.window.createTextEditorDecorationType({ fontWeight: 'bold', fontStyle: 'italic' }),
    headings,
    body: vscode.window.createTextEditorDecorationType(styleOptions(cfg.body, false, true)),
    codeBlock: vscode.window.createTextEditorDecorationType(styleOptions(cfg.codeBlock, true, false)),
    codeInline: vscode.window.createTextEditorDecorationType(styleOptions(cfg.codeInline, false, true)),
    quote: vscode.window.createTextEditorDecorationType(styleOptions(cfg.quote, true, false)),
  };
}

export function disposeDecorationTypes(types: DecorationTypes): void {
  types.hidden.dispose();
  types.fenceHidden.dispose();
  types.copyHint.dispose();
  types.bold.dispose();
  types.italic.dispose();
  types.boldItalic.dispose();
  for (const heading of types.headings) {
    heading.dispose();
  }
  types.body.dispose();
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
export function renderPreview(editor: vscode.TextEditor, types: DecorationTypes, cfg: PreviewConfig): void {
  const doc = editor.document;
  if (doc.languageId !== 'markdown') {
    return;
  }

  const activeLines = collectActiveLines(editor);
  const buckets = createBuckets();
  const bodyEnabled = cfg.body.color !== '' || cfg.body.bold || cfg.body.italic;
  let fence: FenceState | undefined;

  for (let line = 0; line < doc.lineCount; line++) {
    const text = doc.lineAt(line).text;
    const showSource = activeLines.has(line);
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(text);

    // 围栏代码块：整块加背景，块内不做行内解析
    if (fence) {
      buckets.codeBlock.push(range(line, 0, text.length));
      // 只有闭合围栏那一行才隐藏，块内代码必须原样显示
      const closes = fenceMatch !== null
        && fenceMatch[1][0] === fence.char
        && fenceMatch[1].length >= fence.length;
      if (closes) {
        hideFenceLine(buckets, line, text, showSource, false);
        fence = undefined;
      }
      continue;
    }
    if (fenceMatch) {
      fence = { char: fenceMatch[1][0], length: fenceMatch[1].length };
      buckets.codeBlock.push(range(line, 0, text.length));
      hideFenceLine(buckets, line, text, showSource, true);
      continue;
    }

    // 正文样式要避开标题 / 代码 / 引用，先收集本行已被占用的区间
    const occupied: Array<[number, number]> = [];

    if (/^\s{0,3}>/.test(text)) {
      buckets.quote.push(range(line, 0, text.length));
      occupied.push([0, text.length]);
    }

    const heading = /^(#{1,6})([ \t]+)(.*)$/.exec(text);
    if (heading) {
      occupied.push([0, text.length]);
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
      occupied.push([token.openStart, token.closeEnd]);
    }

    if (bodyEnabled) {
      for (const bodyRange of bodyRanges(line, text.length, occupied)) {
        buckets.body.push(bodyRange);
      }
    }
  }

  applyBuckets(editor, types, buckets);
}

/**
 * 围栏行：隐藏三个反引号和语言，行本身保留（行号也还在），看起来是一条空行。
 * 起始围栏额外渲染 [copy]。光标落在该行时按既有规则显示源码，两者都不加。
 */
function hideFenceLine(
  buckets: Buckets,
  line: number,
  text: string,
  showSource: boolean,
  isOpening: boolean,
): void {
  if (showSource) {
    return;
  }
  const lineRange = range(line, 0, text.length);
  buckets.fenceHidden.push(lineRange);
  if (isOpening) {
    buckets.copyHint.push(lineRange);
  }
}

/**
 * 从整行里减掉已被标题 / 代码 / 引用 / 行内标记占用的区间，得到正文样式的区间。
 * 区间互不重叠，这样就不用依赖 decoration 之间的优先级。
 */
function bodyRanges(line: number, length: number, occupied: Array<[number, number]>): vscode.Range[] {
  if (length <= 0) {
    return [];
  }
  const sorted = occupied.slice().sort((a, b) => a[0] - b[0]);
  const result: vscode.Range[] = [];
  let cursor = 0;
  for (const [start, end] of sorted) {
    const from = Math.max(0, start);
    const to = Math.min(length, end);
    if (from > cursor) {
      result.push(range(line, cursor, from));
    }
    if (to > cursor) {
      cursor = to;
    }
  }
  if (cursor < length) {
    result.push(range(line, cursor, length));
  }
  return result;
}

function applyBuckets(editor: vscode.TextEditor, types: DecorationTypes, buckets: Buckets): void {
  editor.setDecorations(types.hidden, buckets.hidden);
  editor.setDecorations(types.fenceHidden, buckets.fenceHidden);
  editor.setDecorations(types.copyHint, buckets.copyHint);
  editor.setDecorations(types.bold, buckets.bold);
  editor.setDecorations(types.italic, buckets.italic);
  editor.setDecorations(types.boldItalic, buckets.boldItalic);
  editor.setDecorations(types.body, buckets.body);
  editor.setDecorations(types.codeBlock, buckets.codeBlock);
  editor.setDecorations(types.codeInline, buckets.codeInline);
  editor.setDecorations(types.quote, buckets.quote);
  types.headings.forEach((type, level) => editor.setDecorations(type, buckets.headings[level]));
}

function createBuckets(): Buckets {
  return {
    hidden: [],
    fenceHidden: [],
    copyHint: [],
    bold: [],
    italic: [],
    boldItalic: [],
    headings: [[], [], [], [], [], []],
    body: [],
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