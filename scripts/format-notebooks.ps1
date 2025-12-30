# Format all Fabric notebook .py files in a directory
# Usage: .\scripts\format-notebooks.ps1 [-Path <directory>] [-DryRun] [-BatchSize <n>] [-Parallel <n>]
#
# Performance optimizations:
#   - Batches multiple files per Node.js invocation (avoids Node startup overhead)
#   - Pre-filters non-Fabric files before processing
#   - Compatible with PowerShell 5.1+

param(
    [string]$Path = "C:\dev\HelixData\workspace\HelixFabric-Engineering\Notebooks",
    [switch]$DryRun,
    [int]$BatchSize = 50      # Files per Node.js process (increased since no parallel overhead)
)

$ErrorActionPreference = "Continue"
$cliPath = Join-Path $PSScriptRoot "..\dist\cli.js"
$cliPath = (Resolve-Path $cliPath).Path

if (-not (Test-Path $cliPath)) {
    Write-Error "CLI not found at $cliPath. Run 'npx tsc' first."
    exit 1
}

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

# Get all .py files
$allFiles = Get-ChildItem -Path $Path -Filter "*.py" -Recurse
Write-Host "Found $($allFiles.Count) .py files in $Path" -ForegroundColor Cyan

# Pre-filter: Only process Fabric notebooks (fast check using first line)
Write-Host "Filtering for Fabric notebooks..." -ForegroundColor Cyan
$fabricFiles = @()
$skipped = 0

foreach ($file in $allFiles) {
    $firstLine = Get-Content -Path $file.FullName -TotalCount 1
    if ($firstLine -match "^# Fabric notebook source") {
        $fabricFiles += $file
    } else {
        $skipped++
    }
}

Write-Host "Found $($fabricFiles.Count) Fabric notebooks ($skipped non-Fabric files skipped)" -ForegroundColor Cyan

if ($DryRun) {
    foreach ($file in $fabricFiles) {
        $relativePath = $file.FullName.Substring($Path.Length + 1)
        Write-Host "[DRY RUN] Would format: $relativePath" -ForegroundColor Yellow
    }
    Write-Host "`nDry run complete. No files modified."
    exit 0
}

if ($fabricFiles.Count -eq 0) {
    Write-Host "No Fabric notebooks found to format."
    exit 0
}

# Split files into batches
$batches = @()
for ($i = 0; $i -lt $fabricFiles.Count; $i += $BatchSize) {
    $endIdx = [Math]::Min($i + $BatchSize - 1, $fabricFiles.Count - 1)
    $batch = $fabricFiles[$i..$endIdx]
    $batches += ,@($batch)
}

Write-Host "Processing $($fabricFiles.Count) files in $($batches.Count) batches (batch size: $BatchSize)" -ForegroundColor Cyan
Write-Host ""

# Aggregate results
$formatted = @()
$unchanged = @()
$errors = @()

# Process batches sequentially using CLI batch mode
$batchNum = 0
foreach ($batch in $batches) {
    $batchNum++
    Write-Host "Processing batch $batchNum/$($batches.Count)..." -ForegroundColor DarkGray
    
    # Get file paths for this batch
    $filePaths = $batch | ForEach-Object { $_.FullName }
    
    # Call CLI in batch mode (single Node.js invocation for all files in batch)
    $jsonOutput = & node $cliPath -b @filePaths 2>&1
    
    try {
        $results = $jsonOutput | ConvertFrom-Json
        foreach ($result in $results) {
            $relativePath = $result.file
            if ($relativePath.StartsWith($Path)) {
                $relativePath = $relativePath.Substring($Path.Length + 1)
            }
            switch ($result.status) {
                'formatted' { $formatted += $relativePath }
                'unchanged' { $unchanged += $relativePath }
                'error'     { $errors += "$relativePath - $($result.error)" }
            }
        }
    } catch {
        # Fallback if JSON parsing fails
        foreach ($file in $batch) {
            $errors += $file.FullName.Substring($Path.Length + 1) + " - JSON parse error: $_"
        }
    }
}

# Output results
foreach ($f in $formatted) {
    Write-Host "[FORMATTED] $f" -ForegroundColor Green
}
foreach ($f in $unchanged) {
    Write-Host "[OK] $f" -ForegroundColor DarkGreen
}
foreach ($f in $errors) {
    Write-Host "[ERROR] $f" -ForegroundColor Red
}

$stopwatch.Stop()

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  Total files:  $($allFiles.Count)"
Write-Host "  Formatted:    $($formatted.Count)" -ForegroundColor Green
Write-Host "  Unchanged:    $($unchanged.Count)" -ForegroundColor DarkGreen
Write-Host "  Skipped:      $skipped" -ForegroundColor Yellow
Write-Host "  Errors:       $($errors.Count)" -ForegroundColor $(if ($errors.Count -gt 0) { "Red" } else { "Green" })
Write-Host "  Time:         $($stopwatch.Elapsed.TotalSeconds.ToString('F1'))s" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
