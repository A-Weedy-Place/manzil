param(
  [ValidateSet('Status', 'Configure', 'Pause', 'Resume', 'Run')][string]$Action = 'Status'
)
$ErrorActionPreference = 'Stop'
$fuelProject = 'manzil-app-v1'
$fuelRegion = 'asia-southeast1'
$fuelJob = 'manzil-fuel-daily'
$fuelWorker = 'https://manzil-source-worker-ld6lwscfya-as.a.run.app'
$fuelCommon = @("--project=$fuelProject", "--location=$fuelRegion", '--quiet')

switch ($Action) {
  'Configure' {
    # The caller must first deploy WORKER_ALLOWED_JOBS=source,agent,fuel.
    $existing = & gcloud.cmd scheduler jobs list @fuelCommon "--filter=name:$fuelJob" '--format=value(name)'
    if ($LASTEXITCODE -ne 0) { throw 'Could not inspect existing Scheduler jobs.' }
    $arguments = @('scheduler', 'jobs')
    if ($existing) { $arguments += @('update', 'http', $fuelJob, '--update-headers=Content-Type=application/json') }
    else { $arguments += @('create', 'http', $fuelJob, '--headers=Content-Type=application/json') }
    $arguments += $fuelCommon + @('--schedule=0 1 * * *', '--time-zone=Asia/Karachi', '--http-method=POST',
      "--uri=$fuelWorker/internal/tick", "--oidc-token-audience=$fuelWorker",
      '--oidc-service-account-email=manzil-source-scheduler@manzil-app-v1.iam.gserviceaccount.com',
      "--message-body-from-file=$(Join-Path $PSScriptRoot '../config/fuel-scheduler-body.json')",
      '--attempt-deadline=180s', '--max-retry-attempts=0', '--format=value(name)')
    & gcloud.cmd @arguments
  }
  'Pause' { & gcloud.cmd scheduler jobs pause $fuelJob @fuelCommon }
  'Resume' { & gcloud.cmd scheduler jobs resume $fuelJob @fuelCommon }
  'Run' { & gcloud.cmd scheduler jobs run $fuelJob @fuelCommon }
  'Status' {
    & gcloud.cmd scheduler jobs describe $fuelJob @fuelCommon '--format=json(name,schedule,timeZone,state,lastAttemptTime,status,httpTarget.uri,httpTarget.oidcToken)'
  }
}
if ($LASTEXITCODE -ne 0) { throw "Fuel Scheduler operation failed: $Action" }
