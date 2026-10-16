# Optional Windows helper for portable runtimes in ignored .local-tools/.
# Downloads and system installations are deliberately separate from this launcher.
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$NpmArguments)
$ErrorActionPreference = 'Stop'
$manzilRoot = Split-Path -Parent $PSScriptRoot
$manzilTools = Join-Path $manzilRoot '.local-tools'
if (Test-Path -LiteralPath $manzilTools) {
  $manzilNode = Get-ChildItem -LiteralPath $manzilTools -Directory -Filter 'node-v24.*-win-x64' |
    Sort-Object { [version]($_.Name -replace '^node-v|-win-x64$', '') } -Descending |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'node.exe') } | Select-Object -First 1
  if ($manzilNode) { $env:PATH = $manzilNode.FullName + ';' + $env:PATH }
  $manzilJava = Get-ChildItem -LiteralPath $manzilTools -Directory -Filter 'java*' |
    Get-ChildItem -Filter 'java.exe' -Recurse | Where-Object { $_.Directory.Name -eq 'bin' } | Select-Object -First 1
  if ($manzilJava) { $env:JAVA_HOME = Split-Path -Parent $manzilJava.Directory.FullName; $env:PATH = $manzilJava.Directory.FullName + ';' + $env:PATH }
  $env:FIREBASE_EMULATORS_PATH = Join-Path $manzilTools 'firebase-emulators'
}
# Android Studio includes a compatible Java runtime on this Windows workstation.
# Only use it for this child process; never change the machine's Java installation.
if (!$manzilJava -and (Test-Path -LiteralPath 'C:\Program Files\Android\Android Studio\jbr\bin\java.exe')) {
  $env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
  $env:PATH = (Join-Path $env:JAVA_HOME 'bin') + ';' + $env:PATH
}
$manzilVersion = (& node --version).TrimStart('v').Split('.')
if ([int]$manzilVersion[0] -lt 24 -or ([int]$manzilVersion[0] -eq 24 -and [int]$manzilVersion[1] -lt 12)) {
  throw 'Manzil requires Node 24.12+. Use a compatible system Node or a portable node-v24.*-win-x64 folder in .local-tools.'
}
if (!$NpmArguments.Count) { $NpmArguments = @('run', 'dev:firebase') }
Push-Location -LiteralPath $manzilRoot
try { & npm.cmd @NpmArguments; $manzilExit = $LASTEXITCODE } finally { Pop-Location }
exit $manzilExit
