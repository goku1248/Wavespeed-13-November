# Render.com Deployment Test Script
# This script tests if your Render.com server is properly configured

param(
    [string]$BaseUrl = "https://wavespeed-server.onrender.com"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Render.com Deployment Verification" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Testing server at: $BaseUrl" -ForegroundColor Gray
Write-Host ""

$allTestsPassed = $true

# Test 1: Health Endpoint
Write-Host "[1/3] Testing /health endpoint..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$BaseUrl/health" -Method Get -TimeoutSec 60
    Write-Host "   ✅ Health check passed" -ForegroundColor Green
    Write-Host "      Status: $($health.status)" -ForegroundColor Gray
    Write-Host "      Database: $($health.database)" -ForegroundColor Gray
    Write-Host "      Port: $($health.port)" -ForegroundColor Gray
    
    if ($health.database -ne "connected") {
        Write-Host "   ⚠️  Warning: Database shows as disconnected" -ForegroundColor Yellow
        Write-Host "      Check MONGODB_URI environment variable in Render Dashboard" -ForegroundColor Gray
        $allTestsPassed = $false
    }
} catch {
    Write-Host "   ❌ Health check failed" -ForegroundColor Red
    Write-Host "      Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Message -like "*404*") {
        Write-Host "      → The /health route may not be deployed" -ForegroundColor Yellow
    } elseif ($_.Exception.Message -like "*timeout*") {
        Write-Host "      → Server may be sleeping (Render free tier)" -ForegroundColor Yellow
        Write-Host "      → Wait 30-60 seconds and try again" -ForegroundColor Yellow
    }
    $allTestsPassed = $false
}

Write-Host ""

# Test 2: API Comments Endpoint
Write-Host "[2/3] Testing /api/comments endpoint..." -ForegroundColor Yellow
try {
    $testUrl = "https://example.com"
    $encodedUrl = [System.Uri]::EscapeDataString($testUrl)
    $comments = Invoke-RestMethod -Uri "$BaseUrl/api/comments?url=$encodedUrl" -Method Get -TimeoutSec 60
    Write-Host "   ✅ Comments endpoint works" -ForegroundColor Green
    Write-Host "      Comments found: $($comments.Count)" -ForegroundColor Gray
    
    if ($comments -is [array]) {
        Write-Host "      Response format: Correct (array)" -ForegroundColor Gray
    } else {
        Write-Host "      ⚠️  Unexpected response format" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Comments endpoint failed" -ForegroundColor Red
    Write-Host "      Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Message -like "*404*") {
        Write-Host "      → The /api/comments route may not be deployed" -ForegroundColor Yellow
        Write-Host "      → Check Render logs and verify server.js has the route" -ForegroundColor Yellow
    }
    $allTestsPassed = $false
}

Write-Host ""

# Test 3: Server Response Time
Write-Host "[3/3] Testing server response time..." -ForegroundColor Yellow
try {
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    $null = Invoke-RestMethod -Uri "$BaseUrl/health" -Method Get -TimeoutSec 60
    $stopwatch.Stop()
    $responseTime = $stopwatch.ElapsedMilliseconds
    
    Write-Host "   ✅ Server responded" -ForegroundColor Green
    Write-Host "      Response time: $responseTime ms" -ForegroundColor Gray
    
    if ($responseTime -gt 10000) {
        Write-Host "      ⚠️  Slow response (>10s) - server may have been sleeping" -ForegroundColor Yellow
    } elseif ($responseTime -gt 5000) {
        Write-Host "      ⚠️  Moderate delay (5-10s) - normal for free tier wake-up" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Response time test failed" -ForegroundColor Red
    $allTestsPassed = $false
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan

# Summary
if ($allTestsPassed) {
    Write-Host "✅ All tests passed! Your Render.com setup looks good." -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Verify the URL in content.js matches: $BaseUrl" -ForegroundColor Gray
    Write-Host "  2. Reload your Chrome extension" -ForegroundColor Gray
    Write-Host "  3. Test the extension on any webpage" -ForegroundColor Gray
} else {
    Write-Host "❌ Some tests failed. Please check:" -ForegroundColor Red
    Write-Host ""
    Write-Host "  1. Render Dashboard → Logs (check for errors)" -ForegroundColor Yellow
    Write-Host "  2. Environment Variables (MONGODB_URI, PORT)" -ForegroundColor Yellow
    Write-Host "  3. Deployment status (should be 'Live')" -ForegroundColor Yellow
    Write-Host "  4. See CHECK_RENDER_SETUP.md for detailed troubleshooting" -ForegroundColor Yellow
}

Write-Host ""

