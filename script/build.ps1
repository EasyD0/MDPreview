<#
.SYNOPSIS
    编译扩展（TypeScript -> out/）。
.EXAMPLE
    ./script/build.ps1
.EXAMPLE
    ./script/build.ps1 -Clean
.EXAMPLE
    ./script/build.ps1 -Watch
#>
[CmdletBinding()]
param(
    [switch]$Watch,
    [switch]$Clean,
    [switch]$SkipInstall
)

. (Join-Path $PSScriptRoot 'common.ps1')

$root = Get-RepoRoot
Write-Step "项目根目录: $root"

if ($Clean) {
    $outDir = Join-Path $root 'out'
    if (-not $outDir.StartsWith($root)) { throw "拒绝清理项目外的目录: $outDir" }
    if (Test-Path $outDir) {
        Write-Step "清理 $outDir"
        Remove-Item -LiteralPath $outDir -Recurse -Force
    }
}

Ensure-Dependencies -SkipInstall:$SkipInstall
Invoke-Compile -Watch:$Watch

if (-not $Watch) { Write-Ok ('编译产物: ' + (Join-Path $root 'out')) }
