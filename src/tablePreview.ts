import * as vscode from 'vscode';

/** 表格块：表头行到最后一行数据（闭区间）。 */
export interface HoverTableBlock {
  start: number;
  end: number;
}

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;
const PIPE_RE = /(^|[^\\])\|/;
const SEP_CELL_RE = /^\s*:?-+:?\s*$/;

/** 按未转义竖线切单元格（首尾竖线是边界）。 */
export function hoverSplitCells(row: string): string[] {
  let text = row.trim();
  if (text.startsWith('|')) {
    text = text.slice(1);
  }
  if (text.endsWith('|') && !text.endsWith('\\|')) {
    text = text.slice(0, -1);
  }
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\' && text[i + 1] === '|') {
      current += '\\|';
      i++;
    } else if (ch === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function isSeparatorRow(text: string): boolean {
  if (!PIPE_RE.test(text) && !text.includes('-')) {
    return false;
  }
  const cells = hoverSplitCells(text);
  return cells.length > 0 && cells.every(cell => SEP_CELL_RE.test(cell));
}

/**
 * 光标所在行是否落在某个表格块内。独立实现围栏跳过：
 * 只用“同字符且长度不短于起始”的闭合规则且跳过块内行，
 * 因此行内代码里出现 ``` 也不会误判（copy.ts 的场景不需要这个强度）。
 */
export function findTableAtLine(document: vscode.TextDocument, line: number): HoverTableBlock | undefined {
  // 先算出所有围栏块行，标记不可用行
  const fenced = new Set<number>();
  let fence: { char: string; length: number } | undefined;
  for (let i = 0; i < document.lineCount; i++) {
    const match = FENCE_RE.exec(document.lineAt(i).text);
    if (fence) {
      fenced.add(i);
      if (match && match[1][0] === fence.char && match[1].length >= fence.length) {
        fence = undefined;
      }
    } else if (match) {
      fence = { char: match[1][0], length: match[1].length };
      fenced.add(i);
    }
  }
  if (fenced.has(line) || line + 1 >= document.lineCount) {
    return undefined;
  }
  // 定位表格块：从光标行向上找表头起点
  const isRow = (i: number): boolean => !fenced.has(i) && PIPE_RE.test(document.lineAt(i).text);
  let start = line;
  while (start > 0 && isRow(start - 1)) {
    start--;
  }
  // 表头 + 分隔行判定
  if (!isRow(start) || start + 1 >= document.lineCount || !isSeparatorRow(document.lineAt(start + 1).text)) {
    return undefined;
  }
  if (!PIPE_RE.test(document.lineAt(start).text)) {
    return undefined;
  }
  let end = start + 1;
  while (end + 1 < document.lineCount && isRow(end + 1)) {
    end++;
  }
  if (line > end) {
    return undefined;
  }
  return { start, end };
}

/** 把表格块转成规整的 GFM markdown（补列、去松散空格），供悬停渲染。 */
export function buildTableMarkdown(document: vscode.TextDocument, block: HoverTableBlock): string {
  const rows: string[][] = [];
  for (let i = block.start; i <= block.end; i++) {
    rows.push(hoverSplitCells(document.lineAt(i).text));
  }
  const columns = Math.max(...rows.map(row => row.length));
  const normalized = rows.map((row, index) => {
    const cells: string[] = [];
    for (let col = 0; col < columns; col++) {
      cells.push(row[col] ?? (index === 1 ? '---' : ''));
    }
    return cells;
  });
  // 第二行必须整体是分隔行（缺的列补 ---）
  normalized[1] = normalized[1].map(cell => (SEP_CELL_RE.test(cell) ? cell : '---'));
  const render = (cells: string[]): string => '| ' + cells.join(' | ') + ' |';
  const lines = [render(normalized[0]), render(normalized[1])];
  for (let i = 2; i < normalized.length; i++) {
    lines.push(render(normalized[i]));
  }
  return lines.join('\n');
}