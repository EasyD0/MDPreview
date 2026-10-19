import * as vscode from 'vscode';

/** 单级标题（h1–h6 之一）的样式。 */
export interface HeadingStyle {
  /** CSS 颜色；空字符串表示不设置颜色，只保留字重/字形。 */
  color: string;
  bold: boolean;
  italic: boolean;
}

/** 扩展的全部可配置项，读取时已回退到默认值。 */
export interface PreviewConfig {
  /** 下标 0 对应 h1，下标 5 对应 h6。 */
  headings: HeadingStyle[];
  codeBlockBackground: string;
  codeInlineBackground: string;
  quoteBackground: string;
}

export const DEFAULT_HEADINGS: HeadingStyle[] = [
  { color: '#569CD6', bold: true, italic: false },
  { color: '#4EC9B0', bold: true, italic: false },
  { color: '#DCDCAA', bold: true, italic: false },
  { color: '#C586C0', bold: true, italic: false },
  { color: '#CE9178', bold: true, italic: false },
  { color: '#9CDCFE', bold: true, italic: false },
];

const DEFAULT_CODE_BLOCK_BG = 'rgba(128, 128, 128, 0.18)';
const DEFAULT_CODE_INLINE_BG = 'rgba(128, 128, 128, 0.24)';
const DEFAULT_QUOTE_BG = 'rgba(128, 128, 128, 0.12)';

/** package.json 里 contributes.configuration 的配置段前缀。 */
const SECTION = 'mdLivePreview';

/**
 * 读取配置。任何缺失或类型不符的键都回退到默认值，
 * 所以用户只写一半（例如只改 h1 的颜色）也不会报错。
 */
export function readConfig(): PreviewConfig {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  const rawHeadings = cfg.get<Record<string, unknown>>('heading');

  const headings: HeadingStyle[] = [];
  for (let level = 1; level <= 6; level++) {
    const raw = rawHeadings ? rawHeadings['h' + level] : undefined;
    headings.push(coerceHeading(raw, DEFAULT_HEADINGS[level - 1]));
  }

  return {
    headings,
    codeBlockBackground: cfg.get<string>('codeBlock.background', DEFAULT_CODE_BLOCK_BG),
    codeInlineBackground: cfg.get<string>('codeInline.background', DEFAULT_CODE_INLINE_BG),
    quoteBackground: cfg.get<string>('quote.background', DEFAULT_QUOTE_BG),
  };
}

function coerceHeading(raw: unknown, fallback: HeadingStyle): HeadingStyle {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    color: typeof value.color === 'string' ? value.color : fallback.color,
    bold: typeof value.bold === 'boolean' ? value.bold : fallback.bold,
    italic: typeof value.italic === 'boolean' ? value.italic : fallback.italic,
  };
}