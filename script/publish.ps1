<#
.SYNOPSIS
    发布扩展（VS Code Marketplace）。
.DESCRIPTION
    PAT 优先取 -Pat 参数，其次取环境变量 VSCE_PAT。
.PARAMETER Bump
    版本号变更方式: none / patch / minor / major，默认 patch。none 表示沿用 package.json 当前版本。
.EXAMPLE
    $env:VSCE_PAT = '<your-token>'
    ./script/publish.ps1 -Bump patch
.EXAMPLE
    ./script/publish.ps1 -Bump none -DryRun
#>
[CmdletBinding()]
param(
    [ValidateSet('none', 'patch', 'minor', 'major')][string]$Bump = 'patch',
    [switch]$PreRelease,
    [string]$Pat,
    [switch]$DryRun,
    [switch]$AllowMissingRepository,
    [switch]$SkipCompile,
    [switch]$SkipInstall
)

. (Join-Path $PSScriptRoot 'common.ps1')

$pkg = Get-PackageJson
$name = Get-JsonProperty $pkg 'name' 'extension'
$version = Get-JsonProperty $pkg 'version' '0.0.0'
$publisher = Get-JsonProperty $pkg 'publisher' ''

# 演练模式只走打包，不校验 publisher / token，方便发布者还没配好时先验证流程。
if ($DryRun) {
    Write-Step '演练模式（-DryRun）: 只打包，不发布'
    & (Join-Path $PSScriptRoot 'package.ps1') -PreRelease:$PreRelease -AllowMissingRepository:$AllowMissingRepository -SkipCompile:$SkipCompile -SkipInstall:$SkipInstall
    return
}

if (-not $publisher) { throw 'package.json 缺少 publisher 字段，无法发布。' }
if ($publisher -eq 'local') {
    throw 'publisher 仍是默认值 "local"，无法发布。请先 create-publisher，再把 package.json 的 publisher 改成真实名称。'
}

if (-not $Pat) { $Pat = $env:VSCE_PAT }
if (-not $Pat) { throw '缺少 Personal Access Token。请用 -Pat <token> 传入，或先设置环境变量 VSCE_PAT。' }

# 用环境变量传 token，避免明文出现在命令行和日志里。
$env:VSCE_PAT = $Pat
$masked = $Pat.Substring(0, [Math]::Min(4, $Pat.Length)) + '****'

Ensure-Dependencies -SkipInstall:$SkipInstall
if (-not $SkipCompile) { Invoke-Compile }

$vsceArgs = @('publish')
if ($Bump -ne 'none') { $vsceArgs += $Bump }
if ($PreRelease) { $vsceArgs += '--pre-release' }
if ($AllowMissingRepository) { $vsceArgs += '--allow-missing-repository' }

Write-Step "发布 $name@$version（publisher: $publisher, token: $masked, bump: $Bump）"
Invoke-Vsce -Arguments $vsceArgs

Write-Ok '发布完成。'
