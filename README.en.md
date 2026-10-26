# Markdown Live Preview (better)

A VS Code extension that renders Markdown directly in the editor. No side-by-side preview needed — the `.md` file you are editing already looks like the rendered result, while code completion, multi-cursor, search, and all other native editing features keep working.

GitHub repository: <https://github.com/EasyD0/MDPreview.git>

English | [简体中文](README.md)

## What can it do?

- Live preview Markdown files while editing
- Renders in the editor itself — no need to switch modes
- Works alongside code completion
- Appearance is fully configurable via `settings.json`

### Supported features

| Category | Effect |
|---|---|
| Headings h1–h6 | Per-level colors, background, bold/italic/underline, font family; level badge at the start of the line (`H1`…`H6` by default) |
| Body text | Color, bold, italic, underline, border, font family |
| Inline formatting | `**bold**`, `*italic*`, `***bold italic***`, `` `inline code` `` are rendered in place; markers are only shown on the line containing the cursor |
| Code blocks | Block background, full border, hidden fence lines (line numbers kept), language badge; a "Copy Code Block" CodeLens above the opening fence |
| Blockquotes | Background and left bar; `>` markers are hidden |
| Lists | `-` / `*` / `+` become bullets; task lists render as ☐ / ☑ |
| Thematic breaks | `---` / `***` / `___` render as a full-width rule (setext headings are detected and skipped) |
| Tables | Hover over any table row to see the table rendered and aligned in a hover popup; the source file is never modified |

Lines covered by the cursor (or selection) always show raw source so you can edit markers directly; they return to the rendered look once the cursor leaves.

## Installation

### From the Marketplace

Search for **Markdown Live Preview (better)** in the VS Code Extensions view (publisher `ace-MS-is-shit`), or run:

```bash
code --install-extension ace-MS-is-shit.better-md-live-preview
```

### From a local VSIX

A packaged VSIX is included in the repository root:

```bash
code --install-extension better-md-live-preview-0.0.1.vsix
```

You can also run **Extensions: Install from VSIX...** in VS Code and pick the file.

## Requirements

- VS Code `^1.80.0`
- Code block copying relies on `editor.codeLens` being enabled (it is on by default)

## Usage

1. Open any `.md` file; the extension activates automatically via `onLanguage:markdown`.
2. Edit as usual — the rendered appearance updates live. Move the cursor onto a line to reveal its raw markers.
3. Hover over table rows to see an aligned table in a popup.
4. Click "Copy Code Block" above a code block's opening fence to copy the block contents (excluding fence lines) to the clipboard.

## Configuring settings.json

All appearance settings live under `mdLivePreview.` in `settings.json`. General rules:

- **An empty string means "not set"** — the current editor theme's default is used.
- Partial objects are fine; omitted fields fall back to their defaults.
- Colors accept any CSS color value, e.g. `#569CD6`, `rgb(60, 60, 60)`, `rgba(128, 128, 128, 0.18)`.
- Font fields (`fontFamily`) take a CSS `font-family` value; quote font names that contain spaces.

### Settings reference

| Setting | Purpose |
|---|---|
| `mdLivePreview.heading` | Styles for all six heading levels. Keys `h1`..`h6`; fields: `color`, `backgroundColor`, `bold`, `italic`, `underline`, `border`, `borderColor`, `borderWidth`, `borderStyle`, `fontFamily` |
| `mdLivePreview.headingPrefix` | Level badge at the start of headings: `enabled`, `format` (`{level}` expands to 1–6), `color`, `backgroundColor` |
| `mdLivePreview.body` | Body text style, same fields as headings |
| `mdLivePreview.bold` | Color for bold text (`color`); leave empty to keep the theme's bold token color |
| `mdLivePreview.codeInline` | Inline code style: color, background, bold/italic/underline, border, font family |
| `mdLivePreview.codeBlock` | Fenced code block style: `backgroundColor`, `border` plus its color/width/style, `underline`, `fontFamily` |
| `mdLivePreview.languageLabel` | Code block language badge: `enabled`, `color` (empty = follow theme) |
| `mdLivePreview.quote` | Blockquote style: color, background, underline, border. The default `borderWidth` is `0 0 0 4px` (left bar only); use `1px` for a full border |
| `mdLivePreview.list` | List style: `bullet`, `bulletColor`, `todoUnchecked`, `todoChecked`, `uncheckedColor`, `checkedColor`, `todoScale` |
| `mdLivePreview.thematicBreak` | Thematic break: `color`, `width`, `style`; an empty `color` keeps the original text |

### Example

```json
{
  "mdLivePreview.heading": {
    "h1": {
      "color": "#ff7b72",
      "backgroundColor": "rgba(255, 123, 114, 0.10)",
      "bold": true,
      "underline": false
    },
    "h2": { "color": "#79c0ff", "backgroundColor": "" }
  },
  "mdLivePreview.headingPrefix": {
    "enabled": true,
    "format": "H{level}",
    "backgroundColor": "rgba(128, 128, 128, 0.20)"
  },
  "mdLivePreview.codeInline": {
    "color": "#DCDCAA",
    "backgroundColor": "rgb(60, 60, 60)",
    "fontFamily": "\"Cascadia Code\", monospace"
  },
  "mdLivePreview.list": {
    "bullet": "●",
    "todoChecked": "☑",
    "todoScale": "1.3"
  },
  "mdLivePreview.quote": {
    "backgroundColor": "rgba(128, 128, 128, 0.12)",
    "borderColor": "rgba(128, 128, 128, 0.55)",
    "borderWidth": "0 0 0 4px"
  }
}
```

## Known limitations

- Hiding markers, underline, and some color/background/font overrides rely on VS Code's `textDecoration` CSS injection channel, which is unofficial. A future VS Code release may break marker hiding (markers would show again), though the basic styling would still work.
- Font selection is not an official decoration capability, and the monospace editor estimates cursor positions assuming a monospace font. Non-monospace fonts will misalign the cursor — stick to monospace font families.
- Code block copying uses CodeLens, which occupies a line above the opening fence; disabling `editor.codeLens` removes the copy entry point.
- 4-space indented code blocks are not treated as code blocks.

## Roadmap

- Fix the copy-code-block offset issue
- TeX formula preview
- Mermaid diagram hover preview

## Development

```bash
# Install dependencies
npm install

# One-off compile (tsc strict)
npm run compile

# Recompile on file changes
npm run watch
```

Debugging: open this project in VS Code and press `F5` to launch the **Extension Development Host**, then open any `.md` file in the new window. Compiled output goes to `out/`, with `out/extension.js` as the entry point.

### Project structure

```
├── src/
│   ├── extension.ts    # Activation: event listeners, commands, CodeLens, table hover
│   ├── config.ts       # Reads mdLivePreview.* settings with per-field fallbacks
│   ├── render.ts       # Decoration type factory, line scanning, inline marker parsing
│   ├── copy.ts         # Fenced block location and content extraction
│   └── tablePreview.ts # Table location and GFM reconstruction for hover
├── out/                # Compiled output (generated)
├── doc/                # Development notes and plans
├── package.json        # Extension manifest and configuration declarations
└── tsconfig.json       # TypeScript compiler configuration
```

## License

[MIT](LICENSE) © 2026 EasyD0
