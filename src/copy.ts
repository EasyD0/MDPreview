import * as vscode from 'vscode';

/** 一个围栏代码块：起始行与闭合行（未闭合时为文档最后一行）。 */
export interface FenceBlock {
  openLine: number;
  closeLine: number;
}

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;

/**
 * 扫描整个文档的围栏块。状态机与 render.ts 相同：
 * 同种围栏字符且长度不短于起始围栏才闭合；文档结束仍未闭合则 closeLine 为最后一行。
 */
export function collectFenceBlocks(doc: vscode.TextDocument): FenceBlock[] {
  const blocks: FenceBlock[] = [];
  let open: { line: number; char: string; length: number } | undefined;
  for (let line = 0; line < doc.lineCount; line++) {
    const match = FENCE_RE.exec(doc.lineAt(line).text);
    if (open) {
      const closes = match !== null
        && match[1][0] === open.char
        && match[1].length >= open.length;
      if (closes) {
        blocks.push({ openLine: open.line, closeLine: line });
        open = undefined;
      }
    } else if (match) {
      open = { line, char: match[1][0], length: match[1].length };
    }
  }
  if (open) {
    blocks.push({ openLine: open.line, closeLine: doc.lineCount - 1 });
  }
  return blocks;
}

/** 用块列表校验某行是否仍是起始围栏行（防 CodeLens 缓存过期后指错行）。 */
export function isFenceOpenLine(blocks: FenceBlock[], line: number): boolean {
  return blocks.some(block => block.openLine === line);
}

/**
 * 提取代码块内容：起始与闭合围栏之间（不含围栏行），join 后裁掉首尾空行。
 * 空块返回空字符串。
 */
export function extractBlockText(doc: vscode.TextDocument, block: FenceBlock): string {
  const lines: string[] = [];
  for (let line = block.openLine + 1; line < block.closeLine; line++) {
    lines.push(doc.lineAt(line).text);
  }
  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  return lines.join('\n');
}