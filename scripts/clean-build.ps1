$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))

$targets = @(
  'dist-renderer',
  'dist-electron',
  'release'
)

foreach ($target in $targets) {
  $resolvedPath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $target))

  if (-not (Test-Path -LiteralPath $resolvedPath)) {
    continue
  }

  try {
    Remove-Item -LiteralPath $resolvedPath -Recurse -Force
    Write-Host "Removed $resolvedPath"
  } catch {
    Write-Error "Failed to remove $resolvedPath. Close the packaged app or any process locking the build artifacts, then retry."
    throw
  }
}
