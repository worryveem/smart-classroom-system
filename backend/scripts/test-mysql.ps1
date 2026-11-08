# Uses a fresh isolated database; never targets or deletes smartclass_db.
$ErrorActionPreference = 'Stop'
if (-not $env:DB_USERNAME) { throw 'Set DB_USERNAME and DB_PASSWORD in this PowerShell session first.' }
$testHost = if ($env:DB_HOST) { $env:DB_HOST } else { 'localhost' }
$testPort = if ($env:DB_PORT) { $env:DB_PORT } else { '3306' }
$testDatabase = 'smartclass_verify_' + [guid]::NewGuid().ToString('N')
$previousTestUrl = $env:SMARTCLASS_MYSQL_TEST_URL
try {
    $env:SMARTCLASS_MYSQL_TEST_URL = "jdbc:mysql://${testHost}:${testPort}/${testDatabase}?createDatabaseIfNotExist=true&connectionCollation=utf8mb4_unicode_ci&serverTimezone=Asia/Ho_Chi_Minh&allowPublicKeyRetrieval=true"
    Write-Host "Running real MySQL integration tests against isolated database $testDatabase"
    Push-Location (Split-Path $PSScriptRoot -Parent)
    try {
        # Windows PowerShell 5 treats native stderr warnings as errors when redirected.
        $previousErrorPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & .\mvnw.cmd clean verify
            $mavenExitCode = $LASTEXITCODE
        } finally { $ErrorActionPreference = $previousErrorPreference }
        if ($mavenExitCode -ne 0) { throw "Maven verification failed (exit code $mavenExitCode)." }
    } finally { Pop-Location }
} finally {
    $env:SMARTCLASS_MYSQL_TEST_URL = $previousTestUrl
}
