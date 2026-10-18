param(
  [ValidateSet('Status', 'EnableReview', 'EnableValidated', 'Disable')][string]$Action = 'Status',
  [ValidatePattern('^[a-z][a-z0-9-]{4,28}[a-z0-9]$')][string]$ProjectId = 'manzil-app-v1',
  [switch]$IncludeResults
)
$ErrorActionPreference = 'Stop'
$agentCloudToken = (& gcloud.cmd auth print-access-token --project=$ProjectId --quiet)
if ($LASTEXITCODE -ne 0 -or -not $agentCloudToken) { throw 'Google Cloud operator login is required.' }
$headers = @{ Authorization = "Bearer $agentCloudToken" }
$root = "https://firestore.googleapis.com/v1/projects/$ProjectId/databases/(default)/documents/manzil/v1/meta"
function Read-AgentMeta([string]$Key) {
  $hasher = [System.Security.Cryptography.SHA256]::Create()
  try { $id = ([BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($Key)))).Replace('-', '').ToLowerInvariant() }
  finally { $hasher.Dispose() }
  try { $doc = Invoke-RestMethod -Uri "$root/$id" -Headers $headers -Method Get }
  catch { if ([int]$_.Exception.Response.StatusCode -ne 404) { throw }; $doc = $null }
  return @{ id = $id; doc = $doc; value = $(if ($doc) { $doc.fields.json.stringValue | ConvertFrom-Json } else { $null }) }
}
try {
  $settings = Read-AgentMeta 'sourceAgentSettings'
  if ($Action -ne 'Status') {
    $value = @{ enabled = $Action -ne 'Disable'; autoPublish = $Action -eq 'EnableValidated' }
    $body = @{ fields = @{ json = @{ stringValue = ($value | ConvertTo-Json -Compress) } } } | ConvertTo-Json -Depth 8 -Compress
    $precondition = $(if ($settings.doc) { 'currentDocument.updateTime=' + [Uri]::EscapeDataString($settings.doc.updateTime) } else { 'currentDocument.exists=false' })
    $null = Invoke-RestMethod -Uri "$root/$($settings.id)?$precondition" -Headers $headers -Method Patch -ContentType 'application/json' -Body $body
    $settings = Read-AgentMeta 'sourceAgentSettings'
  }
  $runtime = Read-AgentMeta 'sourceAgentRuntime'
  $day = [DateTime]::UtcNow.AddHours(5).ToString('yyyy-MM-dd')
  $usage = Read-AgentMeta "sourceAgentUsage:$day"
  $report = @{ projectId = $ProjectId; pakistanDate = $day; settings = $settings.value; runtime = $runtime.value; usage = $usage.value }
  if ($IncludeResults) {
    $notices = Invoke-RestMethod -Uri "https://firestore.googleapis.com/v1/projects/$ProjectId/databases/(default)/documents/manzil/v1/notices?pageSize=100" -Headers $headers -Method Get
    $report.results = @($notices.documents | ForEach-Object {
      $notice = $_.fields.json.stringValue | ConvertFrom-Json
      $result = (Read-AgentMeta "sourceAgentResult:$($notice.id)").value
      if ($result) { @{ sourceId = $notice.sourceId; noticeRevision = $result.noticeRevision; state = $result.state;
        summary = $result.extraction.summary; category = $result.extraction.category; events = $result.extraction.events;
        issues = $result.issues; proposals = $result.proposals; imageCount = $result.imageCount; closureIds = $result.closureIds; usage = $result.usage; errorCode = $result.errorCode } }
    })
    $report.resultsListingPartial = [bool]$notices.nextPageToken
  }
  $report | ConvertTo-Json -Depth 14
} finally { $agentCloudToken = $null; $headers.Clear() }
