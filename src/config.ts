import * as vscode from 'vscode';

/**
 * 一段文本的样式。
 * color / backgroundColor 用空字符串表示「不设置」，沿用编辑器主题；
 * 这样用户可以只改其中一项而不影响其它。
 */
export interface TextStyle {
  color: string;
  backgroundColor: string;
  bold: boolean;
  italic: boolean;
  /** 边框颜色；空字符串或缺失 = 不画边框。 */
  borderColor?: string;
  /** CSS 边框宽度，支持多值（如 `0 0 0 4px` = 只有左边框）。 */
  borderWidth?: string;
  /** CSS 边框线型，默认 solid。 */
  borderStyle?: string;
  /** 下划线开关，默认关。 */
  underline?: boolean;
  /** CSS font-family 字符串；空 = 不替换，沿用编辑器字体。 */
  fontFamily?: string;
  /**
   * 边框开关。显式写了就以它为准；没写则退回「borderColor 非空才画」，
   * 引用块默认的左侧竖条就是走 borderColor 这条路径，不受该开关影响。
   */
  border?: boolean;
}

/** 标题前缀徽章（`L1` 之类）的配置。 */
export interface HeadingPrefixConfig {
  enabled: boolean;
  /** 徽章文本模板，`{level}` 会替换成 1..6。 */
  format: string;
  color: string;
  backgroundColor: string;
}

/** 无序列表与任务列表的渲染配置。 */
export interface ListConfig {
  /** 列表符号替换字符；空字符串 = 不替换（显示原始列表符号）。 */
  bullet: string;
  bulletColor: string;
  /** 未完成 / 已完成任务列表插入的字符；空 = 保留原始 [ ] / [x]。 */
  todoUnchecked: string;
  todoChecked: string;
  uncheckedColor: string;
  checkedColor: string;
  /** 复选框放大倍数（字体字形本身画得小，用 transform 放大）。 */
  todoScale: string;
}

/** --- 分隔线的渲染配置。 */
export interface ThematicBreakConfig {
  /** 线条颜色；空字符串 = 保留原始 --- 文本。 */
  color: string;
  width: string;
  style: string;
}

/** 粗体文本的渲染配置。 */
export interface BoldConfig {
  /** 覆盖主题给粗体 token 的着色；空字符串 = 不覆盖。 */
  color: string;
}

/** 代码块语言标签的配置。 */
export interface LanguageLabelConfig {
  enabled: boolean;
  /** 标签颜色；空字符串 = 用主题的 CodeLens 前景色。 */
  color: string;
}

/** 扩展的全部可配置项，读取时已回退到默认值。 */
export interface PreviewConfig {
  /** 下标 0 对应 h1，下标 5 对应 h6。 */
  headings: TextStyle[];
  /** 标题行首的层级徽章。 */
  headingPrefix: HeadingPrefixConfig;
  list: ListConfig;
  thematicBreak: ThematicBreakConfig;
  bold: BoldConfig;
  languageLabel: LanguageLabelConfig;
  /** 正文：标题、代码、引用之外的部分。 */
  body: TextStyle;
  codeInline: TextStyle;
  codeBlock: TextStyle;
  quote: TextStyle;
}

export const DEFAULT_HEADINGS: TextStyle[] = [
  { color: '#569CD6', backgroundColor: '', bold: true, italic: false, underline: true },
  { color: '#4EC9B0', backgroundColor: '', bold: true, italic: false, underline: true },
  { color: '#DCDCAA', backgroundColor: '', bold: true, italic: false, underline: true },
  { color: '#C586C0', backgroundColor: '', bold: true, italic: false, underline: true },
  { color: '#CE9178', backgroundColor: '', bold: true, italic: false, underline: true },
  { color: '#9CDCFE', backgroundColor: '', bold: true, italic: false, underline: true },
];

const DEFAULT_HEADING_PREFIX: HeadingPrefixConfig = {
  enabled: true, format: 'H{level}', color: '', backgroundColor: '',
};
// 复选框用票箱符号；Maple 等字体对 U+2610/2611 是文本呈现，能被 color 染色。
const DEFAULT_LIST: ListConfig = {
  bullet: '●', bulletColor: '',
  todoUnchecked: '☐', todoChecked: '☑',
  uncheckedColor: '', checkedColor: '', todoScale: '1.3',
};
const DEFAULT_THEMATIC_BREAK: ThematicBreakConfig = {
  color: 'rgba(128, 128, 128, 0.6)', width: '1px', style: 'solid',
};
// CSS 变量在 decoration 注入的样式里可解析，取当前主题的正文字色；兜底 Dark+ 前景。
const DEFAULT_BOLD: BoldConfig = {
  color: 'var(--vscode-editor-foreground, #d4d4d4)',
};
const DEFAULT_LANGUAGE_LABEL: LanguageLabelConfig = {
  enabled: true, color: '',
};
const DEFAULT_BODY: TextStyle = {
  color: '', backgroundColor: '', bold: false, italic: false,
};
const DEFAULT_INLINE_CODE: TextStyle = {
  color: '#DCDCAA', backgroundColor: 'rgb(60, 60, 60)', bold: true, italic: false,
};
const DEFAULT_CODE_BLOCK: TextStyle = {
  color: '', backgroundColor: 'rgba(128, 128, 128, 0.18)', bold: false, italic: false,
  border: true,
};
// 默认做成经典引用样式的左侧竖条：4 个宽度值分别是上右下左。
const DEFAULT_QUOTE: TextStyle = {
  color: '', backgroundColor: 'rgba(128, 128, 128, 0.12)', bold: false, italic: false,
  borderColor: 'rgba(128, 128, 128, 0.55)', borderWidth: '0 0 0 4px', borderStyle: 'solid',
};

/** package.json 里 contributes.configuration 的配置段前缀。 */
const SECTION = 'mdLivePreview';

/**
 * 读取配置。任何缺失或类型不符的字段都回退到默认值，
 * 所以用户只写一部分（例如只改 h1 的颜色）也不会报错。
 */
export function readConfig(): PreviewConfig {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  const rawHeadings = cfg.get<Record<string, unknown>>('heading');

  const headings = DEFAULT_HEADINGS.map((fallback, index) => {
    const raw = rawHeadings ? rawHeadings['h' + (index + 1)] : undefined;
    return readStyle(raw, fallback);
  });

  return {
    headings,
    headingPrefix: readHeadingPrefix(cfg.get<unknown>('headingPrefix')),
    list: readList(cfg.get<unknown>('list')),
    thematicBreak: readThematicBreak(cfg.get<unknown>('thematicBreak')),
    bold: readBold(cfg.get<unknown>('bold')),
    languageLabel: readLanguageLabel(cfg.get<unknown>('languageLabel')),
    body: readStyle(cfg.get<unknown>('body'), DEFAULT_BODY),
    codeInline: readStyle(cfg.get<unknown>('codeInline'), DEFAULT_INLINE_CODE),
    codeBlock: readStyle(cfg.get<unknown>('codeBlock'), DEFAULT_CODE_BLOCK),
    quote: readStyle(cfg.get<unknown>('quote'), DEFAULT_QUOTE),
  };
}

function readHeadingPrefix(raw: unknown): HeadingPrefixConfig {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : DEFAULT_HEADING_PREFIX.enabled,
    // 空字符串或不写都退回默认模板，避免配置成空串后只剩一条竖线
    format: typeof value.format === 'string' && value.format !== ''
      ? value.format
      : DEFAULT_HEADING_PREFIX.format,
    color: typeof value.color === 'string' ? value.color : DEFAULT_HEADING_PREFIX.color,
    backgroundColor: typeof value.backgroundColor === 'string'
      ? value.backgroundColor
      : DEFAULT_HEADING_PREFIX.backgroundColor,
  };
}

function readString(raw: Record<string, unknown>, key: string, fallback: string): string {
  return typeof raw[key] === 'string' ? raw[key] as string : fallback;
}

function readList(raw: unknown): ListConfig {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    bullet: readString(value, 'bullet', DEFAULT_LIST.bullet),
    bulletColor: readString(value, 'bulletColor', DEFAULT_LIST.bulletColor),
    todoUnchecked: readString(value, 'todoUnchecked', DEFAULT_LIST.todoUnchecked),
    todoChecked: readString(value, 'todoChecked', DEFAULT_LIST.todoChecked),
    uncheckedColor: readString(value, 'uncheckedColor', DEFAULT_LIST.uncheckedColor),
    checkedColor: readString(value, 'checkedColor', DEFAULT_LIST.checkedColor),
    todoScale: readString(value, 'todoScale', DEFAULT_LIST.todoScale),
  };
}

function readBold(raw: unknown): BoldConfig {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { color: readString(value, 'color', DEFAULT_BOLD.color) };
}

function readLanguageLabel(raw: unknown): LanguageLabelConfig {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : DEFAULT_LANGUAGE_LABEL.enabled,
    color: typeof value.color === 'string' ? value.color : DEFAULT_LANGUAGE_LABEL.color,
  };
}

function readThematicBreak(raw: unknown): ThematicBreakConfig {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const width = readString(value, 'width', DEFAULT_THEMATIC_BREAK.width);
  const style = readString(value, 'style', DEFAULT_THEMATIC_BREAK.style);
  return {
    color: readString(value, 'color', DEFAULT_THEMATIC_BREAK.color),
    width: width !== '' ? width : DEFAULT_THEMATIC_BREAK.width,
    style: style !== '' ? style : DEFAULT_THEMATIC_BREAK.style,
  };
}

function readStyle(raw: unknown, fallback: TextStyle): TextStyle {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    color: typeof value.color === 'string' ? value.color : fallback.color,
    backgroundColor: typeof value.backgroundColor === 'string' ? value.backgroundColor : fallback.backgroundColor,
    bold: typeof value.bold === 'boolean' ? value.bold : fallback.bold,
    italic: typeof value.italic === 'boolean' ? value.italic : fallback.italic,
    borderColor: typeof value.borderColor === 'string' ? value.borderColor : fallback.borderColor ?? '',
    borderWidth: typeof value.borderWidth === 'string' && value.borderWidth !== ''
      ? value.borderWidth
      : fallback.borderWidth ?? '1px',
    borderStyle: typeof value.borderStyle === 'string' && value.borderStyle !== ''
      ? value.borderStyle
      : fallback.borderStyle ?? 'solid',
    // 保持「没写就是 undefined」而不是 false：undefined 让 styleOptions
    // 退回看 borderColor，false 才会强制关闭。
    underline: typeof value.underline === 'boolean' ? value.underline : fallback.underline,
    fontFamily: typeof value.fontFamily === 'string' ? value.fontFamily : fallback.fontFamily ?? '',
    border: typeof value.border === 'boolean' ? value.border : fallback.border,
  };
}