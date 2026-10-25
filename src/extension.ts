import * as vscode from 'vscode';
import { readConfig } from './config';
import type { PreviewConfig } from './config';
import { createDecorationTypes, disposeDecorationTypes, renderPreview } from './render';
import { collectFenceBlocks, extractBlockText, isFenceOpenLine } from './copy';
import { buildTableMarkdown, findTableAtLine } from './tablePreview';
import type { DecorationTypes } from './render';

let previewConfig: PreviewConfig | undefined;
let decorationTypes: DecorationTypes | undefined;

/** 重算所有可见编辑器里的样式。 */
function refresh(): void {
  if (!previewConfig || !decorationTypes) {
    return;
  }
  for (const editor of vscode.window.visibleTextEditors) {
    renderPreview(editor, decorationTypes, previewConfig);
  }
}

/** 配置变化后重建 decoration 类型（颜色之类的属性写在类型上，改不了只能重建）。 */
function rebuild(): void {
  if (decorationTypes) {
    disposeDecorationTypes(decorationTypes);
  }
  previewConfig = readConfig();
  decorationTypes = createDecorationTypes(previewConfig);
  refresh();
}

export function activate(context: vscode.ExtensionContext): void {
  rebuild();

  // 代码块复制：起始围栏行上方的 CodeLens 链接。provider 只在该行出一条，
  // 其余行不产生任何 CodeLens 行。
  const copyCommand = 'mdLivePreview.copyCodeBlock';
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ language: 'markdown' }, {
      provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        return collectFenceBlocks(document).map(block => new vscode.CodeLens(
          new vscode.Range(block.openLine, 0, block.openLine, 0),
          { title: "复制代码块", command: copyCommand, arguments: [document.uri, block.openLine] },
        ));
      },
    }),
    // 表格悬浮预览：光标在表格行上悬停，浮窗里渲染规整的真表格。
    vscode.languages.registerHoverProvider({ language: 'markdown' }, {
      provideHover(document: vscode.TextDocument, position: vscode.Position) {
        const block = findTableAtLine(document, position.line);
        if (!block) {
          return undefined;
        }
        const markdown = new vscode.MarkdownString(
          buildTableMarkdown(document, block),
        );
        // 单元格内容按 markdown 渲染（粗体/链接等），但不允许命令链接
        markdown.supportHtml = false;
        return new vscode.Hover(
          markdown,
          new vscode.Range(block.start, 0, block.end, document.lineAt(block.end).text.length),
        );
      },
    }),
    vscode.commands.registerCommand(copyCommand, async (uri: vscode.Uri, openLine: number) => {
      const doc = await vscode.workspace.openTextDocument(uri);
      // CodeLens 可能过期（文档已编辑），重新校验该行仍是起始围栏。
      const block = collectFenceBlocks(doc).find(item => item.openLine === openLine);
      if (!block || !isFenceOpenLine([block], openLine)) {
        return;
      }
      const text = extractBlockText(doc, block);
      if (text === '') {
        return;
      }
      await vscode.env.clipboard.writeText(text);
      const lineCount = text.split('\n').length;
      vscode.window.setStatusBarMessage(`已复制代码块（${lineCount} 行）`, 2500);
    }),
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => refresh()),
    vscode.window.onDidChangeVisibleTextEditors(() => refresh()),
    vscode.window.onDidChangeTextEditorSelection(() => refresh()),
    vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.languageId === 'markdown') {
        refresh();
      }
    }),

    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('mdLivePreview')) {
        rebuild();
      }
    }),
    {
      dispose: () => {
        if (decorationTypes) {
          disposeDecorationTypes(decorationTypes);
          decorationTypes = undefined;
        }
      },
    },
  );
}

export function deactivate(): void {
  if (decorationTypes) {
    disposeDecorationTypes(decorationTypes);
    decorationTypes = undefined;
  }
}