param(
  [ValidateSet('Status', 'Enable', 'Disable')][string]$Action = 'Status',
  [ValidatePattern('^[a-z][a-z0-9-]{4,28}[a-z0-9]$')][string]$ProjectId = 'manzil-app-v1',
  [switch]$IncludeNotices
)
$ErrorActionPreference = 'Stop'
# Operator OAuth stays in process memory; never print it, persist it or put it into an image.
$sourceCloudToken = (& gcloud.cmd auth print-access-token --project=$ProjectId --quiet)
if ($LASTEXITCODE -ne 0 -or -not $sourceCloudToken) { throw 'Google Cloud operator login is required.' }
$headers = @{ Authorization = "Bearer $sourceCloudToken" }
$root = "https://firestore.googleapis.com/v1/projects/$ProjectId/databases/(default)/documents/manzil/v1/meta"
function Read-SourceMeta([string]$Key) {
  $hasher = [System.Security.Cryptography.SHA256]::Create()
  try { $id = ([BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($Key)))).Replace('-', '').ToLowerInvariant() }
  finally { $hasher.Dispose() }
  try { $doc = Invoke-RestMethod -Uri "$root/$id" -Headers $headers -Method Get }
  catch { if ([int]$_.Exception.Response.StatusCode -ne 404) { throw }; $doc = $null }
  return @{ id = $id; doc = $doc; value = $(if ($doc) { $doc.fields.json.stringValue | ConvertFrom-Json } else { $null }) }
}
try {
  $status = Read-SourceMeta 'sourceStatus'
  if ($Action -ne 'Status') {
    $value = $status.value
    if (-not $value) {
      $value = [PSCustomObject]@{ enabled = $false; intervalMinutes = 5; profileUrl = 'https://x.com/shaheryarhassan'; lastAttemptAt = $null; lastSuccessAt = $null; nextCheckAt = $null; state = 'disabled'; message = ''; noticesCollected = 0; coverage = 'partial' }
    }
    $enabled = $Action -eq 'Enable'
    $value.enabled = $enabled
    $value.intervalMinutes = 5
    $value.state = $(if ($enabled) { 'idle' } else { 'disabled' })
    $value.nextCheckAt = $(if ($enabled) { [DateTime]::UtcNow.ToString('o') } else { $null })
    $value.message = $(if ($enabled) { 'Five-minute collection enabled. Coverage is partial; model processing has separate settings.' } else { 'Collection paused by operator. Existing evidence retained.' })
    $body = @{ fields = @{ json = @{ stringValue = ($value | ConvertTo-Json -Depth 12 -Compress) } } } | ConvertTo-Json -Depth 16 -Compress
    $precondition = $(if ($status.doc) { 'currentDocument.updateTime=' + [Uri]::EscapeDataString($status.doc.updateTime) } else { 'currentDocument.exists=false' })
    $null = Invoke-RestMethod -Uri "$root/$($status.id)?$precondition" -Headers $headers -Method Patch -ContentType 'application/json' -Body $body
    $status = Read-SourceMeta 'sourceStatus'
  }
  $run = Read-SourceMeta 'sourceLastRun'
  $report = @{ projectId = $ProjectId; sourceStatus = $status.value; lastRun = $run.value }
  if ($IncludeNotices) {
    $noticeUrl = "https://firestore.googleapis.com/v1/projects/$ProjectId/databases/(default)/documents/manzil/v1/notices?pageSize=100"
    $notices = Invoke-RestMethod -Uri $noticeUrl -Headers $headers -Method Get
    $report.notices = @($notices.documents | ForEach-Object {
      $notice = $_.fields.json.stringValue | ConvertFrom-Json
      @{ sourceId = $notice.sourceId; revision = $notice.revision; status = $notice.status; publishedAt = $notice.publishedAt; textCharacters = $notice.text.Length; mediaCount = @($notice.mediaUrls).Count }
    })
    $report.noticeListingPartial = [bool]$notices.nextPageToken
  }
  $report | ConvertTo-Json -Depth 14
} finally { $sourceCloudToken = $null; $headers.Clear() }
