import * as vscode from 'vscode';
import { readConfig } from './config';
import type { PreviewConfig } from './config';
import { createDecorationTypes, disposeDecorationTypes, renderPreview } from './render';
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