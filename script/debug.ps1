<#
.SYNOPSIS
    编译扩展并启动 VS Code 扩展开发宿主窗口（调试用）。
.DESCRIPTION
    用 code --extensionDevelopmentPath 打开一个开发宿主窗口。
    故意不加 --disable-extensions，所以宿主里其它扩展（含代码补全）照常工作。
.EXAMPLE
    ./script/debug.ps1
.EXAMPLE
    ./script/debug.ps1 -File ./doc/plan.md
.EXAMPLE
    ./script/debug.ps1 -Inspect -ReuseWindow
#>
[CmdletBinding()]
param(
    [string]$File,
    [switch]$Inspect,
    [int]$InspectPort = 9229,
    [switch]$ReuseWindow,
    [switch]$Clean,
    [switch]$SkipInstall
)

. (Join-Path $PSScriptRoot 'common.ps1')

$root = Get-RepoRoot

if ($Clean) {
    $outDir = Join-Path $root 'out'
    if (-not $outDir.StartsWith($root)) { throw "拒绝清理项目外的目录: $outDir" }
    if (Test-Path $outDir) {
        Write-Step "清理 $outDir"
        Remove-Item -LiteralPath $outDir -Recurse -Force
    }
}

Ensure-Dependencies -SkipInstall:$SkipInstall
Invoke-Compile

$code = Resolve-Tool @('code.cmd', 'code')
if (-not $code) {
    throw '找不到 code 命令。请在 VS Code 里执行 "Shell Command: Install code command in PATH"。'
}

$codeArgs = @("--extensionDevelopmentPath=$root")
if ($ReuseWindow) { $codeArgs += '--reuse-window' } else { $codeArgs += '--new-window' }
if ($Inspect) { $codeArgs += "--inspect-extensions=$InspectPort" }

if ($File) {
    if (-not (Test-Path $File)) { throw "找不到要打开的文件: $File" }
    $codeArgs += (Resolve-Path $File).Path
}

# PowerShell 5.1 的 Start-Process 不会自动给含空格的参数加引号，这里手动补。
$quotedArgs = @()
foreach ($a in $codeArgs) {
    if ($a -match '\s') { $quotedArgs += ('"' + $a + '"') } else { $quotedArgs += $a }
}

Write-Step '启动扩展开发宿主窗口'
Start-Process -FilePath $code -ArgumentList $quotedArgs

Write-Ok '开发宿主已启动（窗口标题带 [Extension Development Host]）'
Write-Note '在宿主窗口打开任意 .md 文件即可看到渲染效果；改了代码后先在宿主窗口按 Ctrl+R 重载。'
Write-Note '需要持续编译的话，另开一个终端跑: ./script/build.ps1 -Watch'
