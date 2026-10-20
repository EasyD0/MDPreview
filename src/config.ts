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
}

/** 扩展的全部可配置项，读取时已回退到默认值。 */
export interface PreviewConfig {
  /** 下标 0 对应 h1，下标 5 对应 h6。 */
  headings: TextStyle[];
  /** 正文：标题、代码、引用之外的部分。 */
  body: TextStyle;
  codeInline: TextStyle;
  codeBlock: TextStyle;
  quote: TextStyle;
}

export const DEFAULT_HEADINGS: TextStyle[] = [
  { color: '#569CD6', backgroundColor: '', bold: true, italic: false },
  { color: '#4EC9B0', backgroundColor: '', bold: true, italic: false },
  { color: '#DCDCAA', backgroundColor: '', bold: true, italic: false },
  { color: '#C586C0', backgroundColor: '', bold: true, italic: false },
  { color: '#CE9178', backgroundColor: '', bold: true, italic: false },
  { color: '#9CDCFE', backgroundColor: '', bold: true, italic: false },
];

const DEFAULT_BODY: TextStyle = {
  color: '', backgroundColor: '', bold: false, italic: false,
};
const DEFAULT_INLINE_CODE: TextStyle = {
  color: '', backgroundColor: 'rgba(128, 128, 128, 0.24)', bold: false, italic: false,
};
const DEFAULT_CODE_BLOCK: TextStyle = {
  color: '', backgroundColor: 'rgba(128, 128, 128, 0.18)', bold: false, italic: false,
};
const DEFAULT_QUOTE: TextStyle = {
  color: '', backgroundColor: 'rgba(128, 128, 128, 0.12)', bold: false, italic: false,
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
    body: readStyle(cfg.get<unknown>('body'), DEFAULT_BODY),
    codeInline: readStyle(cfg.get<unknown>('codeInline'), DEFAULT_INLINE_CODE),
    codeBlock: readStyle(cfg.get<unknown>('codeBlock'), DEFAULT_CODE_BLOCK),
    quote: readStyle(cfg.get<unknown>('quote'), DEFAULT_QUOTE),
  };
}

function readStyle(raw: unknown, fallback: TextStyle): TextStyle {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    color: typeof value.color === 'string' ? value.color : fallback.color,
    backgroundColor: typeof value.backgroundColor === 'string' ? value.backgroundColor : fallback.backgroundColor,
    bold: typeof value.bold === 'boolean' ? value.bold : fallback.bold,
    italic: typeof value.italic === 'boolean' ? value.italic : fallback.italic,
  };
}