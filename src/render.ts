import * as vscode from 'vscode';
import type { PreviewConfig, TextStyle } from './config';

/** 一组 decoration 类型。配置变化时整体重建，所以需要显式 dispose。 */
export interface DecorationTypes {
  hidden: vscode.TextEditorDecorationType;
  /** 围栏行内容：保留行高，把文字涂透明。 */
  fenceHidden: vscode.TextEditorDecorationType;

  bold: vscode.TextEditorDecorationType;
  italic: vscode.TextEditorDecorationType;
  boldItalic: vscode.TextEditorDecorationType;
  /** 下标 0 对应 h1，下标 5 对应 h6。 */
  headings: vscode.TextEditorDecorationType[];
  /** 标题行首的层级徽章（L1..L6）。下标同 headings。 */
  headingPrefix: vscode.TextEditorDecorationType[];
  /** 正文：标题、代码、引用之外的部分。 */
  body: vscode.TextEditorDecorationType;
  codeBlock: vscode.TextEditorDecorationType;
  /** 代码块边框按行角色分型：0=首行 1=中间行 2=末行 3=单行块。未开启边框时为空。 */
  codeBlockBorder: vscode.TextEditorDecorationType[];
  codeInline: vscode.TextEditorDecorationType;
  quote: vscode.TextEditorDecorationType;
  /** 列表符号（•）。 */
  bullet: vscode.TextEditorDecorationType | undefined;
  /** 任务列表复选框：0=未完成 1=已完成。 */
  todo: vscode.TextEditorDecorationType[];
  /** --- 分隔线（整行下边框）。 */
  thematicBreak: vscode.TextEditorDecorationType | undefined;
  /**
   * 代码块语言标签（起始围栏行行首的 before 角标）。语言名不固定，
   * contentText 又写在类型上，所以做成按需懒创建的类型池；配置变化
   * 重建 decoration 时整池销毁。配置未启用为 undefined。
   */
  languageLabels: Map<string, vscode.TextEditorDecorationType> | undefined;
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
  bold: vscode.Range[];
  italic: vscode.Range[];
  boldItalic: vscode.Range[];
  headings: vscode.Range[][];
  headingPrefix: vscode.Range[][];
  body: vscode.Range[];
  codeBlock: vscode.Range[];
  codeBlockBorder: vscode.Range[][];
  codeInline: vscode.Range[];
  quote: vscode.Range[];
  bullet: vscode.Range[];
  todo: vscode.Range[][];
  thematicBreak: vscode.Range[];
  languageLabels: Map<string, vscode.Range[]>;
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
  // 语法 token 的颜色是 span 上的行内样式，decoration 的 color（类规则）压不过它；
  // backgroundColor / fontWeight 没有这个问题（token 不用行内样式写它们）。
  // 借 textDecoration 原样注入 CSS 的通道加 !important（同 hidden 的 display:none，非官方用法）。
  // 下划线走同一条通道；没开下划线时保留开头的 none，颜色注入才生效。
  const css: string[] = [];
  if (style.color) {
    css.push(`color: ${style.color} !important`);
  }
  if (style.backgroundColor) {
    options.backgroundColor = style.backgroundColor;
    // 注入只给行内装饰（codeInline）用：它的背景要画在 token span 上，
    // 结构化属性在该运行时不生效。整行装饰（codeBlock / quote）的背景画在
    // 行背景层、本来就能工作；如果再注入一份到字符 span 上，同色半透明
    // 叠两层会在文字处变深，看起来像两种背景色。
    if (!wholeLine) {
      css.push(`background-color: ${style.backgroundColor} !important`);
    }
  }
  // 字体：官方 decoration 没有 fontFamily（token 也是行内样式写死字体），
  // 同样走注入通道。非等宽字体时光标按半角宽估算，会有对不齐——
  // 建议只配等宽字体族。
  if (style.fontFamily) {
    css.push(`font-family: ${style.fontFamily} !important`);
  }
  if (style.underline) {
    css.unshift('underline');
  }
  if (css.length > 0) {
    options.textDecoration = (style.underline ? '' : 'none; ') + css.join('; ') + ';';
  }
  // 边框：显式写了 border 布尔就听它的，没写则退回「borderColor 非空才画」
  // （引用块默认竖条走 borderColor，不受开关影响）。
  // 用分离的 border* 字段而非 border 简写，这样 borderWidth 才能是多值
  // （0 0 0 4px = 只有左边的竖条）。左侧竖条不需要 borderCollapse：上下宽度
  // 都是 0，相邻行天然拼成连续竖条，而且左右边框不改变行高。
  const wantBorder = typeof style.border === 'boolean' ? style.border : !!style.borderColor;
  if (wantBorder) {
    options.borderWidth = style.borderWidth || '1px';
    options.borderStyle = style.borderStyle || 'solid';
    options.borderColor = style.borderColor || 'rgba(128, 128, 128, 0.5)';
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

  // 层级徽章。before 只能把整段文本写进装饰起点，所以每级一个类型（内容不同）。
  const prefixOptions = (level: number): vscode.DecorationRenderOptions => {
    const before: vscode.ThemableDecorationAttachmentRenderOptions = {
      contentText: cfg.headingPrefix.format.replace(/\{level\}/g, String(level)),
      // before 和正文之间留一个空格的间距
      margin: '0 0.6em 0 0',
    };
    if (cfg.headingPrefix.color) {
      before.color = cfg.headingPrefix.color;
    }
    if (cfg.headingPrefix.backgroundColor) {
      before.backgroundColor = cfg.headingPrefix.backgroundColor;
    }
    return { before };
  };
  const headingPrefix = cfg.headingPrefix.enabled
    ? [1, 2, 3, 4, 5, 6].map(level => vscode.window.createTextEditorDecorationType(prefixOptions(level)))
    : [];

  // decoration 叠加规则：同一个字符上，越晚 createTextEditorDecorationType 的类型优先级越高
  // （VS Code 按这个顺序往同一个 span 上叠加 CSS）。所以下面按「从底到顶」的顺序创建：
  // 整行背景（codeBlock / quote）在前，行内样式在后，最后才是 codeInline ——
  // 这样引用块 / 代码块里的行内代码不会被整行背景盖掉。
  // textDecoration 里塞 display:none 是 VS Code 的非官方用法：官方 API 没有隐藏文本的能力。
  const hidden = vscode.window.createTextEditorDecorationType({ textDecoration: 'none; display: none;' });
  // 围栏行不能也用 display:none：display:none 只给标记符类型用；
  // 围栏行整行涂透明，保住行高，看起来像空行。
  const fenceHidden = vscode.window.createTextEditorDecorationType({
    textDecoration: 'none; color: transparent !important;',
  });

  // 粗体着色覆盖：主题的 **粗体** token 有自己的颜色（行内样式），要压过它
  // 同样走注入通道。默认覆盖成正文前景色，即粗体只变粗细、不变色。
  const boldOptions: vscode.DecorationRenderOptions = { fontWeight: 'bold' };
  const boldItalicOptions: vscode.DecorationRenderOptions = { fontWeight: 'bold', fontStyle: 'italic' };
  if (cfg.bold.color) {
    const inject = `none; color: ${cfg.bold.color} !important;`;
    boldOptions.textDecoration = inject;
    boldItalicOptions.textDecoration = inject;
  }
  const bold = vscode.window.createTextEditorDecorationType(boldOptions);
  const italic = vscode.window.createTextEditorDecorationType({ fontStyle: 'italic' });
  const boldItalic = vscode.window.createTextEditorDecorationType(boldItalicOptions);
  const body = vscode.window.createTextEditorDecorationType(styleOptions(cfg.body, false, true));
  // 代码块边框：整行装饰是逐行的，同一类型画整圈会让多行块变成表格格子，
  // borderCollapse 在不少运行时不生效（实测）。改成按行角色分 4 个类型：
  // 首行只画上+左+右、中间行只画左右、末行只画下+左+右，相邻行拼成一个矩形。
  const codeBlockWantsBorder = typeof cfg.codeBlock.border === 'boolean'
    ? cfg.codeBlock.border
    : !!cfg.codeBlock.borderColor;
  // 基础类型只留背景等，不再画边框。
  const codeBlock = vscode.window.createTextEditorDecorationType(
    styleOptions({ ...cfg.codeBlock, border: false }, true, false),
  );
  const borderOnly = (width: string): vscode.DecorationRenderOptions => ({
    isWholeLine: true,
    borderWidth: width,
    borderStyle: cfg.codeBlock.borderStyle || 'solid',
    borderColor: cfg.codeBlock.borderColor || 'rgba(128, 128, 128, 0.5)',
  });
  // 自定义 borderWidth 按单一粗细用（多值只取第一个词），角色拼接规则优先。
  const cbWidth = (cfg.codeBlock.borderWidth || '1px').split(/\s+/)[0];
  const codeBlockBorder = codeBlockWantsBorder
    ? [
      vscode.window.createTextEditorDecorationType(borderOnly(cbWidth + ' ' + cbWidth + ' 0 ' + cbWidth)),
      vscode.window.createTextEditorDecorationType(borderOnly('0 ' + cbWidth)),
      vscode.window.createTextEditorDecorationType(borderOnly('0 ' + cbWidth + ' ' + cbWidth + ' ' + cbWidth)),
      vscode.window.createTextEditorDecorationType(borderOnly(cbWidth)),
    ]
    : [];
  const quote = vscode.window.createTextEditorDecorationType(styleOptions(cfg.quote, true, false));
  const codeInline = vscode.window.createTextEditorDecorationType(styleOptions(cfg.codeInline, false, true));

  // 列表符号与复选框：同一字符位置的 before 只能有一个装饰生效，所以三类
  // 互斥处理（todo 行不再套 bullet），且都插在标记起点。
  const attachment = (contentText: string, color: string, scale?: string): vscode.DecorationRenderOptions => {
    const before: vscode.ThemableDecorationAttachmentRenderOptions = { contentText, margin: '0 0.35em 0 0' };
    if (color) {
      before.color = color;
    }
    if (scale && scale !== '1' && scale !== '') {
      // attachment 没有 fontSize 属性；票箱字形（U+2610/2611）在多数等宽字体里
      // 画得比字号小。借 textDecoration 注入通道做 transform 放大（非官方用法，
      // 不生效时退化为原大小）。transform-origin 让放大后仍与原点对齐。
      before.textDecoration = `none; display: inline-block; transform: scale(${scale}); transform-origin: left center;`;
    }
    return { before };
  };
  const bullet = cfg.list.bullet !== ''
    ? vscode.window.createTextEditorDecorationType(attachment(cfg.list.bullet, cfg.list.bulletColor))
    : undefined;
  const todo = cfg.list.todoUnchecked !== '' && cfg.list.todoChecked !== ''
    ? [
      vscode.window.createTextEditorDecorationType(
        attachment(cfg.list.todoUnchecked, cfg.list.uncheckedColor, cfg.list.todoScale),
      ),
      vscode.window.createTextEditorDecorationType(
        attachment(cfg.list.todoChecked, cfg.list.checkedColor, cfg.list.todoScale),
      ),
    ]
    : [];
  // 分隔线：隐藏 --- 后给整行画一条下边框（isWholeLine 横跨视口宽度）。
  const thematicBreak = cfg.thematicBreak.color !== ''
    ? vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        borderWidth: `0 0 ${cfg.thematicBreak.width} 0`,
        borderStyle: 'solid',
        borderColor: cfg.thematicBreak.color,
      })
    : undefined;
  // 标签类型按需创建，这里只建空池；渲染时见一个语言建一个。
  const languageLabels = cfg.languageLabel.enabled ? new Map<string, vscode.TextEditorDecorationType>() : undefined;

  return {
    hidden,
    fenceHidden,
    bold,
    italic,
    boldItalic,
    headings,
    headingPrefix,
    body,
    codeBlock,
    codeBlockBorder,
    codeInline,
    quote,
    bullet,
    todo,
    thematicBreak,
    languageLabels,
  };
}

export function disposeDecorationTypes(types: DecorationTypes): void {
  types.hidden.dispose();
  types.fenceHidden.dispose();
  types.bold.dispose();
  types.italic.dispose();
  types.boldItalic.dispose();
  for (const heading of types.headings) {
    heading.dispose();
  }
  for (const prefix of types.headingPrefix) {
    prefix.dispose();
  }
  types.body.dispose();
  types.codeBlock.dispose();
  for (const type of types.codeBlockBorder) {
    type.dispose();
  }
  types.codeInline.dispose();
  types.quote.dispose();
  types.bullet?.dispose();
  for (const type of types.todo) {
    type.dispose();
  }
  types.thematicBreak?.dispose();
  if (types.languageLabels) {
    for (const type of types.languageLabels.values()) {
      type.dispose();
    }
  }
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
  // 上一行是否可能是段落续行（决定 --- 是分隔线还是 setext 标题下划线）
  let prevParagraphish = false;
  // 当前代码块的行（含围栏行）。边框角色要等知道块尾才能定，先收集后分配。
  let fenceLines: Array<{ line: number; len: number }> = [];
  const pushFenceBorders = () => {
    if (types.codeBlockBorder.length === 0 || fenceLines.length === 0) {
      return;
    }
    const last = fenceLines.length - 1;
    fenceLines.forEach((entry, index) => {
      const role = fenceLines.length === 1 ? 3 : index === 0 ? 0 : index === last ? 2 : 1;
      buckets.codeBlockBorder[role].push(range(entry.line, 0, entry.len));
    });
  };

  for (let line = 0; line < doc.lineCount; line++) {
    const text = doc.lineAt(line).text;
    const showSource = activeLines.has(line);
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(text);

    // 围栏代码块：整块加背景，块内不做行内解析
    if (fence) {
      buckets.codeBlock.push(range(line, 0, text.length));
      fenceLines.push({ line, len: text.length });
      // 只有闭合围栏那一行才隐藏，块内代码必须原样显示
      const closes = fenceMatch !== null
        && fenceMatch[1][0] === fence.char
        && fenceMatch[1].length >= fence.length;
      if (closes) {
        hideFenceLine(buckets, line, text, showSource);
        pushFenceBorders();
        fence = undefined;
        fenceLines = [];
      }
      continue;
    }
    if (fenceMatch) {
      fence = { char: fenceMatch[1][0], length: fenceMatch[1].length };
      fenceLines = [{ line, len: text.length }];
      buckets.codeBlock.push(range(line, 0, text.length));
      hideFenceLine(buckets, line, text, showSource);
      // 语言标签：整行透明后在行首插语言名角标；无语言或光标行不插。
      if (types.languageLabels && !showSource) {
        const language = fenceMatch[1] && /\S+/.exec(text.slice(fenceMatch.index + fenceMatch[1].length));
        if (language) {
          const existing = buckets.languageLabels.get(language[0]);
          if (existing) {
            existing.push(range(line, 0, text.length));
          } else {
            buckets.languageLabels.set(language[0], [range(line, 0, text.length)]);
          }
        }
      }
      continue;
    }

    // 正文样式要避开标题 / 代码 / 引用，先收集本行已被占用的区间
    const occupied: Array<[number, number]> = [];

    // 引用块：命中从行首起连续的一段 > 标记（每个 > 后允许吃掉一个空格/制表符，
    // 与 CommonMark 一致：>> 嵌套、> > 带空格都算一段）。标记符进 hidden，
    // 整行的背景 / 左侧竖条照常，光标行照常显示源码。
    const quoteMatch = /^(\s{0,3}>[ \t]?)+/.exec(text);
    if (quoteMatch) {
      buckets.quote.push(range(line, 0, text.length));
      occupied.push([0, text.length]);
      if (!showSource) {
        buckets.hidden.push(range(line, 0, quoteMatch[0].length));
      }
    }

    // --- 分隔线：形如 ---、* * *、___。上一行若是段落行，这行就是 setext
    // 标题的下划线，不能当分隔线处理。命中后隐藏标记、整行画下边框。
    const thematic = /^(\s{0,3})(?:(-\s*)(\2\s*){2,}|(_\s*)(\4\s*){2,}|(\*\s*)(\6\s*){2,})$/.exec(text);
    if (thematic && !prevParagraphish) {
      if (!showSource) {
        buckets.hidden.push(range(line, 0, text.length));
        if (types.thematicBreak) {
          buckets.thematicBreak.push(range(line, 0, text.length));
        }
      }
      occupied.push([0, text.length]);
      prevParagraphish = false;
      // 隐藏后照常走行内解析没有意义，直接跳过本行剩余处理
      if (bodyEnabled) {
        for (const bodyRange of bodyRanges(line, text.length, occupied)) {
          buckets.body.push(bodyRange);
        }
      }
      continue;
    }

    // 无序列表：`- 内容` / `* 内容` / `+ 内容`。把标记符替换成圆点。
    // 任务列表 `- [ ]` 额外把 [ ] / [x] 替换成 ☐ / ☑。上一行是段落时，
    // - 开头的下一行是 setext 候选，已在上面的 thematic 判定处理过。
    const bulletMatch = /^(\s*)([-*+])([ \t]+)(.*)$/.exec(text);
    if (bulletMatch && bulletMatch[4] !== '') {
      const markerStart = bulletMatch[1].length;
      const markerEnd = markerStart + 1 + bulletMatch[3].length;
      const todoMatch = /^(\[( |x|X)\])([ \t]+|$)/.exec(bulletMatch[4]);
      const isTodo = todoMatch !== null && types.todo.length === 2;
      // 任务列表行用复选框本身当列表符号：- 标记只隐藏、不插圆点，
      // 否则一行里出现两个列表记号。
      if (!showSource && (types.bullet || isTodo)) {
        buckets.hidden.push(range(line, markerStart, markerEnd));
        if (!isTodo && types.bullet) {
          buckets.bullet.push(range(line, markerStart, markerEnd));
        }
      }
      if (isTodo) {
        const todoStart = markerEnd;
        const todoEnd = todoStart + todoMatch[1].length;
        const done = todoMatch[2] !== ' ';
        if (!showSource) {
          buckets.hidden.push(range(line, todoStart, todoEnd));
          buckets.todo[done ? 1 : 0].push(range(line, todoStart, todoEnd));
        }
        occupied.push([markerStart, todoEnd]);
      } else {
        occupied.push([markerStart, markerEnd]);
      }
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
        const contentRange = range(line, contentFrom, contentTo);
        buckets.headings[heading[1].length - 1].push(contentRange);
        // 光标行显示源码（# 还在），再加个徽章会抢行首位置，所以跳过
        if (types.headingPrefix.length > 0 && !showSource) {
          buckets.headingPrefix[heading[1].length - 1].push(contentRange);
        }
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
    // setext 候选只对「纯文字行」成立：带 # 标题 / > 引用等前缀的行都算块级
    prevParagraphish = text.trim() !== '' && occupied.length === 0;
  }

  // 文件结束时围栏仍未闭合：把最后一段也当作完整块处理
  pushFenceBorders();
  applyBuckets(editor, types, buckets, cfg);
}

/**
 * 围栏行：隐藏三个反引号和语言，行本身保留（行号也还在），看起来是一条空行。
 * 光标落在该行时按既有规则显示源码。复制入口已改为 CodeLens（见 copy.ts）。
 */
function hideFenceLine(buckets: Buckets, line: number, text: string, showSource: boolean): void {
  if (showSource) {
    return;
  }
  buckets.fenceHidden.push(range(line, 0, text.length));
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

function applyBuckets(editor: vscode.TextEditor, types: DecorationTypes, buckets: Buckets, cfg: PreviewConfig): void {
  editor.setDecorations(types.hidden, buckets.hidden);
  editor.setDecorations(types.fenceHidden, buckets.fenceHidden);
  editor.setDecorations(types.bold, buckets.bold);
  editor.setDecorations(types.italic, buckets.italic);
  editor.setDecorations(types.boldItalic, buckets.boldItalic);
  editor.setDecorations(types.body, buckets.body);
  editor.setDecorations(types.codeBlock, buckets.codeBlock);
  types.codeBlockBorder.forEach((type, role) => editor.setDecorations(type, buckets.codeBlockBorder[role]));
  editor.setDecorations(types.codeInline, buckets.codeInline);
  editor.setDecorations(types.quote, buckets.quote);
  if (types.bullet) {
    editor.setDecorations(types.bullet, buckets.bullet);
  }
  types.todo.forEach((type, state) => editor.setDecorations(type, buckets.todo[state]));
  if (types.thematicBreak) {
    editor.setDecorations(types.thematicBreak, buckets.thematicBreak);
  }
  applyLanguageLabels(editor, types, buckets, cfg);
  types.headings.forEach((type, level) => editor.setDecorations(type, buckets.headings[level]));
  types.headingPrefix.forEach((type, level) => editor.setDecorations(type, buckets.headingPrefix[level]));
}

/**
 * 语言标签：类型池按需扩容。颜色在创建时定死（配置项），
 * 未配置时用 ThemeColor 引用主题值，主题切换自动跟随。
 */
function applyLanguageLabels(
  editor: vscode.TextEditor,
  types: DecorationTypes,
  buckets: Buckets,
  cfg: PreviewConfig,
): void {
  const pool = types.languageLabels;
  if (!pool) {
    return;
  }
  for (const [language, ranges] of buckets.languageLabels) {
    let type = pool.get(language);
    if (!type) {
      const before: vscode.ThemableDecorationAttachmentRenderOptions = {
        contentText: language,
        margin: '0 0.8em 0 0',
      };
      if (cfg.languageLabel.color) {
        before.color = cfg.languageLabel.color;
      } else {
        before.color = new vscode.ThemeColor('editorCodeLens.foreground');
      }
      type = vscode.window.createTextEditorDecorationType({ before });
      pool.set(language, type);
    }
    editor.setDecorations(type, ranges);
  }
}

function createBuckets(): Buckets {
  return {
    hidden: [],
    fenceHidden: [],
    bold: [],
    italic: [],
    boldItalic: [],
    headings: [[], [], [], [], [], []],
    headingPrefix: [[], [], [], [], [], []],
    body: [],
    codeBlock: [],
    codeBlockBorder: [[], [], [], []],
    codeInline: [],
    quote: [],
    bullet: [],
    todo: [[], []],
    thematicBreak: [],
    languageLabels: new Map<string, vscode.Range[]>(),
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