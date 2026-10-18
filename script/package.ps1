<#
.SYNOPSIS
    本地打包生成 .vsix 文件。
.EXAMPLE
    ./script/package.ps1
.EXAMPLE
    ./script/package.ps1 -OutDir dist -PreRelease
#>
[CmdletBinding()]
param(
    [string]$OutDir = 'dist',
    [switch]$PreRelease,
    [switch]$AllowMissingRepository,
    [switch]$SkipCompile,
    [switch]$SkipInstall
)

. (Join-Path $PSScriptRoot 'common.ps1')

$pkg = Get-PackageJson
$name = Get-JsonProperty $pkg 'name' 'extension'
$version = Get-JsonProperty $pkg 'version' '0.0.0'
$repository = Get-JsonProperty $pkg 'repository'

Ensure-Dependencies -SkipInstall:$SkipInstall
if (-not $SkipCompile) { Invoke-Compile }

$outFull = Get-VsixOutputDir -OutDir $OutDir
$suffix = ''
if ($PreRelease) { $suffix = '-prerelease' }
$vsixPath = Join-Path $outFull "$name-$version$suffix.vsix"

$vsceArgs = @('package', '--out', $vsixPath)
if ($PreRelease) { $vsceArgs += '--pre-release' }
if ($AllowMissingRepository -or (-not $repository)) {
    if (-not $repository) { Write-Note 'package.json 缺少 repository 字段，加 --allow-missing-repository 跳过校验。' }
    $vsceArgs += '--allow-missing-repository'
}

Invoke-Vsce -Arguments $vsceArgs

if (-not (Test-Path $vsixPath)) { throw '未生成 .vsix，请检查上面 vsce 的输出。' }

Write-Ok "打包完成: $vsixPath"
Write-Note ('安装: code --install-extension "' + $vsixPath + '"')
