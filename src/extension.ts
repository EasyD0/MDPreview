import * as vscode from 'vscode';

// 隐藏标记符（# 和 **）。这是 Decoration 的非官方 CSS 注入写法。
const hiddenType = vscode.window.createTextEditorDecorationType({
  textDecoration: 'none; display: none;',
});
// 标题文字、加粗文字显示为粗体
const boldType = vscode.window.createTextEditorDecorationType({
  fontWeight: 'bold',
});

function update(editor: vscode.TextEditor | undefined): void {
  if (!editor || editor.document.languageId !== 'markdown') {
    return;
  }
  const doc = editor.document;

  // 光标（或选区）所在的行：显示源码，不隐藏标记符
  const activeLines = new Set<number>();
  for (const sel of editor.selections) {
    for (let l = sel.start.line; l <= sel.end.line; l++) {
      activeLines.add(l);
    }
  }

  const hidden: vscode.Range[] = [];
  const bold: vscode.Range[] = [];
  let inFence = false;

  for (let i = 0; i < doc.lineCount; i++) {
    const text = doc.lineAt(i).text;

    // 跳过代码块
    if (/^\s*(```|~~~)/.test(text)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }

    const showSource = activeLines.has(i);

    // 标题：# 开头
    const h = /^#{1,6}\s+/.exec(text);
    if (h) {
      bold.push(new vscode.Range(i, h[0].length, i, text.length));
      if (!showSource) {
        hidden.push(new vscode.Range(i, 0, i, h[0].length));
      }
    }

    // 加粗：**text**
    const re = /\*\*(?=\S)(.+?)(?<=\S)\*\*/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const start = m.index;
      const end = start + m[0].length;
      bold.push(new vscode.Range(i, start + 2, i, end - 2));
      if (!showSource) {
        hidden.push(new vscode.Range(i, start, i, start + 2));
        hidden.push(new vscode.Range(i, end - 2, i, end));
      }
    }
  }

  editor.setDecorations(hiddenType, hidden);
  editor.setDecorations(boldType, bold);
}

export function activate(context: vscode.ExtensionContext): void {
  const refresh = () => update(vscode.window.activeTextEditor);
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(refresh),
    vscode.window.onDidChangeTextEditorSelection(e => update(e.textEditor)),
    vscode.workspace.onDidChangeTextDocument(e => {
      const ed = vscode.window.activeTextEditor;
      if (ed && e.document === ed.document) {
        update(ed);
      }
    }),
    hiddenType,
    boldType
  );
  refresh();
}

export function deactivate(): void {}
