<#
.SYNOPSIS
    script/ 下各脚本共用的工具函数库。只被点源引用，不单独执行。
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-RepoRoot {
    <# 返回扩展项目根目录（script 的上一级）。 #>
    return (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

function Write-Step {
    param([Parameter(Mandatory)][string]$Message)
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([Parameter(Mandatory)][string]$Message)
    Write-Host "  OK  $Message" -ForegroundColor Green
}

function Write-Note {
    param([Parameter(Mandatory)][string]$Message)
    Write-Host "  提示: $Message" -ForegroundColor Yellow
}

function Resolve-Tool {
    <# 按候选名依次查找可执行文件，返回第一个命中的完整路径；都没找到返回 $null。 #>
    param([Parameter(Mandatory)][string[]]$Names)
    foreach ($name in $Names) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd) { return $cmd.Source }
    }
    return $null
}

function Invoke-Tool {
    <# 运行外部命令并检查退出码；非 0 时抛异常。 #>
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [string[]]$Arguments = @(),
        [string]$ErrorMessage = ''
    )
    Write-Host ('  $ ' + $FilePath + ' ' + ($Arguments -join ' ')) -ForegroundColor DarkGray
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        if ($ErrorMessage) { throw "$ErrorMessage（退出码 $LASTEXITCODE）" }
        throw "命令执行失败: $FilePath（退出码 $LASTEXITCODE）"
    }
}

function Get-PackageJson {
    <# 读取项目根目录的 package.json。 #>
    $path = Join-Path (Get-RepoRoot) 'package.json'
    if (-not (Test-Path $path)) { throw "找不到 package.json: $path" }
    return (Get-Content $path -Raw -Encoding UTF8 | ConvertFrom-Json)
}

function Get-JsonProperty {
    <# 安全读取 JSON 属性，缺失时返回默认值（StrictMode 下不会抛异常）。 #>
    param(
        [Parameter(Mandatory)]$InputObject,
        [Parameter(Mandatory)][string]$Name,
        $Default = $null
    )
    if ($InputObject -and ($InputObject.PSObject.Properties.Name -contains $Name)) {
        return $InputObject.$Name
    }
    return $Default
}

function Ensure-Dependencies {
    <# node_modules 不存在时执行 npm 安装。 #>
    param([switch]$SkipInstall)
    $root = Get-RepoRoot
    if (Test-Path (Join-Path $root 'node_modules')) { return }
    if ($SkipInstall) { throw '缺少 node_modules（依赖尚未安装），但已指定 -SkipInstall。' }
    $npm = Resolve-Tool @('npm.cmd', 'npm')
    if (-not $npm) { throw '找不到 npm，请先安装 Node.js 并加入 PATH。' }
    Write-Step '安装依赖'
    $npmArgs = @('install')
    if (Test-Path (Join-Path $root 'package-lock.json')) { $npmArgs = @('ci') }
    Invoke-Tool -FilePath $npm -Arguments $npmArgs -ErrorMessage 'npm 安装依赖失败'
}

function Invoke-Compile {
    <# 调用 package.json 里的 compile / watch 脚本。 #>
    param([switch]$Watch)
    $npm = Resolve-Tool @('npm.cmd', 'npm')
    if (-not $npm) { throw '找不到 npm，请先安装 Node.js 并加入 PATH。' }
    $target = 'compile'
    if ($Watch) { $target = 'watch' }
    Write-Step "npm run $target"
    Invoke-Tool -FilePath $npm -Arguments @('run', $target) -ErrorMessage "npm run $target 失败"
}

function Invoke-Vsce {
    <# 依次尝试 本地 node_modules/.bin/vsce、全局 vsce、npx @vscode/vsce。 #>
    param([Parameter(Mandatory)][string[]]$Arguments)
    $root = Get-RepoRoot
    $local = Join-Path $root 'node_modules\.bin\vsce.cmd'
    if (Test-Path $local) {
        Invoke-Tool -FilePath $local -Arguments $Arguments
        return
    }
    $global = Resolve-Tool @('vsce.cmd', 'vsce')
    if ($global) {
        Invoke-Tool -FilePath $global -Arguments $Arguments
        return
    }
    $npx = Resolve-Tool @('npx.cmd', 'npx')
    if (-not $npx) { throw '找不到 vsce。请执行 "npm i -D @vscode/vsce" 或 "npm i -g @vscode/vsce"。' }
    Write-Note '未检测到 vsce，改用 npx @vscode/vsce（首次需要联网下载）。'
    Invoke-Tool -FilePath $npx -Arguments (@('--yes', '@vscode/vsce') + $Arguments)
}

function Get-VsixOutputDir {
    <# 解析输出目录（相对路径基于项目根目录），不存在则创建。 #>
    param([Parameter(Mandatory)][string]$OutDir)
    $root = Get-RepoRoot
    $full = $OutDir
    if (-not [System.IO.Path]::IsPathRooted($full)) { $full = Join-Path $root $OutDir }
    if (-not (Test-Path $full)) { New-Item -ItemType Directory -Path $full -Force | Out-Null }
    return (Resolve-Path $full).Path
}
