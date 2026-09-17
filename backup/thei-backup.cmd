<# :
@echo off
rem Thei backup client for Windows. Double-click for the menu, or pass flags:
rem   thei-backup.cmd --run            back up now, as a manual copy
rem   thei-backup.cmd --run --auto     back up if a week has passed
rem   thei-backup.cmd --run --force    back up even if the site shrank sharply
rem   thei-backup.cmd --status         print the current state and exit
rem   thei-backup.cmd --config <path>  use a different settings file
rem Everything below is PowerShell, which ships with Windows.
setlocal
set "THEI_BACKUP_SCRIPT=%~f0"
set "THEI_BACKUP_ARGS=%*"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "& ([ScriptBlock]::Create([IO.File]::ReadAllText($env:THEI_BACKUP_SCRIPT, [Text.Encoding]::UTF8)))"
set "THEI_BACKUP_EXIT=%ERRORLEVEL%"
endlocal & exit /b %THEI_BACKUP_EXIT%
#>

# Pulls content/ off a Thei instance over its backup API and keeps a rotating
# set of copies on this machine. Downloaded from the admin panel, the site
# address (and a freshly generated token) are already filled in below.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2

$DefaultSiteUrl = '__THEI_SITE_URL__'
$DefaultToken = '__THEI_BACKUP_TOKEN__'

$WeekMs = 7 * 24 * 60 * 60 * 1000
$ParallelDownloads = 6
$AutoKeep = 3
# A run stops instead of rotating out an old copy when the site lost more than
# this share of its files or bytes since the last backup.
$ShrinkAlertPercent = 30
$TaskName = 'Thei Backup'
$ConfigKeys = @('siteUrl', 'token', 'destination', 'clientLabel', 'lastRunAt', 'lastFileCount', 'lastByteCount', 'alert')

$ScriptPath = $env:THEI_BACKUP_SCRIPT
$ScriptDir = Split-Path -Parent $ScriptPath
# Everything that changes lives in one object: this code runs as a script block,
# where script-scoped variables would not be these ones.
$State = @{
  ConfigPath = Join-Path $ScriptDir 'thei-backup.conf'
  Http = $null
}

try {
  [Console]::OutputEncoding = [Text.Encoding]::UTF8
} catch {}

# ------------------------------------------------------------------ output

function Say([string]$Text = '', [string]$Color = '') {
  if ($Color) { Write-Host $Text -ForegroundColor $Color } else { Write-Host $Text }
}
function Info([string]$Text) { Write-Host '· ' -NoNewline -ForegroundColor DarkGray; Write-Host $Text }
function Ok([string]$Text) { Write-Host '√ ' -NoNewline -ForegroundColor Green; Write-Host $Text }
function Warn([string]$Text) { Write-Host '! ' -NoNewline -ForegroundColor Yellow; Write-Host $Text }
function Fail([string]$Text) { Write-Host '× ' -NoNewline -ForegroundColor Red; Write-Host $Text }

function HumanSize([double]$Bytes) {
  $units = @('B', 'KB', 'MB', 'GB', 'TB')
  $unit = 0
  while ($Bytes -ge 1024 -and $unit -lt $units.Count - 1) { $Bytes /= 1024; $unit++ }
  if ($unit -gt 0 -and $Bytes -lt 10) { return ('{0:0.0} {1}' -f $Bytes, $units[$unit]) }
  return ('{0:0} {1}' -f $Bytes, $units[$unit])
}

function NowMs { [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }

function HumanAgo([long]$ThenMs) {
  if ($ThenMs -le 0) { return 'never' }
  $days = [Math]::Floor(((NowMs) - $ThenMs) / 86400000)
  if ($days -le 0) { return 'today' }
  if ($days -eq 1) { return 'yesterday' }
  return "$days days ago"
}

# Sortable, filename-safe and unambiguous across time zones.
function StampFromMs([long]$Ms) {
  [DateTimeOffset]::FromUnixTimeMilliseconds($Ms).UtcDateTime.ToString("yyyyMMdd'T'HHmmss'Z'")
}

# ---------------------------------------------------------------- settings

$Config = [ordered]@{}

function IsPlaceholder([string]$Value) { $Value -like '__THEI_*__' }

function ReadConfig {
  foreach ($key in $ConfigKeys) { $Config[$key] = '' }
  foreach ($key in @('lastRunAt', 'lastFileCount', 'lastByteCount')) { $Config[$key] = '0' }
  if (Test-Path -LiteralPath $($State.ConfigPath)) {
    foreach ($line in [IO.File]::ReadAllLines($($State.ConfigPath), [Text.Encoding]::UTF8)) {
      $index = $line.IndexOf('=')
      if ($index -lt 1) { continue }
      $key = $line.Substring(0, $index)
      if ($ConfigKeys -contains $key) { $Config[$key] = $line.Substring($index + 1) }
    }
  } else {
    if (-not (IsPlaceholder $DefaultSiteUrl)) { $Config.siteUrl = $DefaultSiteUrl }
    if (-not (IsPlaceholder $DefaultToken)) { $Config.token = $DefaultToken }
  }
}

function WriteConfig {
  $directory = Split-Path -Parent $($State.ConfigPath)
  if ($directory -and -not (Test-Path -LiteralPath $directory)) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
  }
  $lines = foreach ($key in $ConfigKeys) { "$key=$($Config[$key])" }
  $temp = "$($State.ConfigPath).$PID.tmp"
  [IO.File]::WriteAllLines($temp, [string[]]$lines, (New-Object Text.UTF8Encoding $false))
  Move-Item -LiteralPath $temp -Destination $($State.ConfigPath) -Force
}

function ConfigComplete {
  [bool]($Config.siteUrl -and $Config.token -and $Config.destination)
}

function SiteBase { $Config.siteUrl.TrimEnd('/') }

function DestinationPath {
  $value = [Environment]::ExpandEnvironmentVariables($Config.destination)
  if ([IO.Path]::IsPathRooted($value)) { return $value }
  return (Join-Path $ScriptDir $value)
}

# --------------------------------------------------------------------- api

Add-Type -AssemblyName System.Net.Http
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch {}

function Client {
  if (-not $State.Http) {
    $handler = New-Object Net.Http.HttpClientHandler
    $State.Http = New-Object Net.Http.HttpClient $handler
    $State.Http.Timeout = [TimeSpan]::FromHours(2)
  }
  $State.Http.DefaultRequestHeaders.Remove('x-thei-backup-token') | Out-Null
  $State.Http.DefaultRequestHeaders.Add('x-thei-backup-token', $Config.token)
  return $State.Http
}

function Api([string]$Method, [string]$Path, $Body = $null) {
  $request = New-Object Net.Http.HttpRequestMessage ([Net.Http.HttpMethod]::new($Method)), ((SiteBase) + $Path)
  if ($null -ne $Body) {
    $json = $Body | ConvertTo-Json -Compress
    $request.Content = New-Object Net.Http.StringContent $json, ([Text.Encoding]::UTF8), 'application/json'
  }
  $response = (Client).SendAsync($request).GetAwaiter().GetResult()
  $text = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  if (-not $response.IsSuccessStatusCode) {
    $detail = if ($text.Length -gt 200) { $text.Substring(0, 200) } else { $text }
    throw "$Method $Path failed: HTTP $([int]$response.StatusCode) $detail"
  }
  if ($text) { return ($text | ConvertFrom-Json) }
  return $null
}

# ------------------------------------------------------------------ backup

# Downloads one file in a runspace of its own; returns 'ok', 'gone' or 'fail'.
$DownloadWorker = {
  param($SiteBase, $Token, $SessionId, $Path, $Size, $Target)
  Add-Type -AssemblyName System.Net.Http
  $part = "$Target.part"
  try {
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($Target)) | Out-Null
    $have = 0
    if ([IO.File]::Exists($part)) {
      $have = (New-Object IO.FileInfo $part).Length
      if ($have -gt $Size) { [IO.File]::Delete($part); $have = 0 }
    }
    if ($have -lt $Size -or $Size -eq 0) {
      $client = New-Object Net.Http.HttpClient
      $client.Timeout = [TimeSpan]::FromHours(2)
      $client.DefaultRequestHeaders.Add('x-thei-backup-token', $Token)
      $url = "$SiteBase/api/backup/session/$SessionId/file?path=$([Uri]::EscapeDataString($Path))"
      $request = New-Object Net.Http.HttpRequestMessage ([Net.Http.HttpMethod]::Get), $url
      if ($have -gt 0) { [void]$request.Headers.TryAddWithoutValidation('Range', "bytes=$have-") }
      $response = $client.SendAsync($request, [Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
      $status = [int]$response.StatusCode
      if ($status -eq 404) {
        # Reclaimed by the site's own cleanup after the snapshot.
        if ([IO.File]::Exists($part)) { [IO.File]::Delete($part) }
        return @{ result = 'gone'; path = $Path }
      }
      if ($status -ne 200 -and $status -ne 206) {
        return @{ result = 'fail'; path = $Path; status = $status }
      }
      $mode = if ($status -eq 206) { [IO.FileMode]::Append } else { [IO.FileMode]::Create }
      $stream = New-Object IO.FileStream $part, $mode, ([IO.FileAccess]::Write)
      try {
        $response.Content.CopyToAsync($stream).GetAwaiter().GetResult()
      } finally {
        $stream.Dispose()
        $response.Dispose()
        $client.Dispose()
      }
    }
    if ((New-Object IO.FileInfo $part).Length -ne $Size) {
      return @{ result = 'fail'; path = $Path; status = 'size' }
    }
    if ([IO.File]::Exists($Target)) { [IO.File]::Delete($Target) }
    [IO.File]::Move($part, $Target)
    return @{ result = 'ok'; path = $Path; size = $Size }
  } catch {
    return @{ result = 'fail'; path = $Path; status = $_.Exception.Message }
  }
}

function ReuseSources([string]$Destination) {
  if (-not (Test-Path -LiteralPath $Destination)) { return @() }
  @(Get-ChildItem -LiteralPath $Destination -Directory -Force |
    Where-Object { $_.Name -match '^(auto|manual)-' -or $_.Name.StartsWith('.tmp-') } |
    Sort-Object Name -Descending | ForEach-Object { $_.FullName })
}

function ShrinkPercent([long]$Before, [long]$After) {
  if ($Before -le 0 -or $After -ge $Before) { return 0 }
  return [int][Math]::Floor(($Before - $After) * 100 / $Before)
}

function NotifyAlert([string]$Message) {
  $destination = DestinationPath
  try {
    New-Item -ItemType Directory -Force -Path $destination | Out-Null
    $text = @(
      "Thei backup stopped on $(Get-Date).",
      '',
      $Message,
      '',
      'No copy was made and no old copy was removed. If the site really',
      'lost this much on purpose, run the backup client and choose',
      '"Back up anyway" to accept the new size.'
    )
    [IO.File]::WriteAllLines((Join-Path $destination 'ALERT.txt'), [string[]]$text)
  } catch {}
  try {
    Add-Type -AssemblyName System.Windows.Forms
    [void][System.Windows.Forms.MessageBox]::Show(
      "The site shrank since the last backup:`n`n$Message`n`nNothing was copied and no old copy was removed.",
      'Thei backup stopped',
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Warning,
      [System.Windows.Forms.MessageBoxDefaultButton]::Button1,
      [System.Windows.Forms.MessageBoxOptions]::DefaultDesktopOnly)
  } catch {}
}

function ClearAlert {
  $Config.alert = ''
  $file = Join-Path (DestinationPath) 'ALERT.txt'
  if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force }
}

function ProgressLine([int]$Done, [int]$Total, [long]$Bytes, [int]$Reused) {
  $percent = if ($Total -gt 0) { [Math]::Floor($Done * 100 / $Total) } else { 100 }
  Write-Host "`r  " -NoNewline
  Write-Host ('{0,3}%' -f $percent) -NoNewline -ForegroundColor Cyan
  Write-Host "  $Done/$Total  $(HumanSize $Bytes)  " -NoNewline
  Write-Host "reused $Reused   " -NoNewline -ForegroundColor DarkGray
}

# Returns 0 on success, 1 on failure and 2 when the shrink check stopped the run.
function PerformBackup([string]$Kind, [bool]$Force) {
  $destination = DestinationPath
  New-Item -ItemType Directory -Force -Path $destination | Out-Null

  Info "Opening a session on $($Config.siteUrl)"
  $body = @{ kind = $Kind }
  if ($Config.clientLabel) { $body.clientLabel = $Config.clientLabel }
  $session = Api 'POST' '/api/backup/session' $body
  if (@($session.skipped).Count) {
    Warn "Not part of a backup, left in place: $(@($session.skipped) -join ', ')"
  }
  Info "$($session.totalFiles) file(s), $(HumanSize $session.totalBytes)"

  $lastFiles = [long]$Config.lastFileCount
  $lastBytes = [long]$Config.lastByteCount
  if (-not $Force -and $lastFiles -gt 0) {
    $filesLost = ShrinkPercent $lastFiles $session.totalFiles
    $bytesLost = ShrinkPercent $lastBytes $session.totalBytes
    if ($filesLost -gt $ShrinkAlertPercent -or $bytesLost -gt $ShrinkAlertPercent) {
      try { Api 'DELETE' "/api/backup/session/$($session.sessionId)" | Out-Null } catch {}
      $report = "files $lastFiles -> $($session.totalFiles) (-$filesLost%), size $(HumanSize $lastBytes) -> $(HumanSize $session.totalBytes) (-$bytesLost%)"
      $Config.alert = "$([DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mmZ')) $report"
      WriteConfig
      Say
      Write-Host '  THE SITE SHRANK SINCE THE LAST BACKUP  ' -BackgroundColor DarkRed -ForegroundColor White
      Say "  $report" 'Red'
      Say '  Nothing was copied and no old copy was rotated out.'
      Say '  Check the site. If this is expected, choose "Back up anyway".'
      NotifyAlert $report
      return 2
    }
  }

  $staging = Join-Path $destination ".tmp-$($session.sessionId)"
  New-Item -ItemType Directory -Force -Path $staging | Out-Null
  $sources = ReuseSources $destination | Where-Object { $_ -ne $staging }

  $copied = 0; $reused = 0; $gone = 0; $bytes = [long]0
  $failures = New-Object Collections.Generic.List[string]
  $pool = [RunspaceFactory]::CreateRunspacePool(1, $ParallelDownloads)
  $pool.Open()
  $site = SiteBase
  $interactive = -not [Console]::IsOutputRedirected

  try {
    $cursor = $null
    do {
      $query = 'limit=1000'
      if ($cursor) { $query += "&cursor=$cursor" }
      $page = Api 'GET' "/api/backup/session/$($session.sessionId)/manifest?$query"
      $jobs = New-Object Collections.Generic.List[object]
      foreach ($entry in @($page.entries)) {
        $relative = $entry.path -replace '/', '\'
        $target = Join-Path $staging $relative
        if ((Test-Path -LiteralPath $target) -and (Get-Item -LiteralPath $target).Length -eq $entry.size) {
          $reused++; $bytes += $entry.size; continue
        }
        # Only assets/ is addressed by the hash of its bytes, so only there a
        # matching name and size is guaranteed to be the same file.
        $source = $null
        if ($entry.path.StartsWith('assets/')) {
          foreach ($candidate in $sources) {
            $path = Join-Path $candidate $relative
            if ((Test-Path -LiteralPath $path) -and (Get-Item -LiteralPath $path).Length -eq $entry.size) {
              $source = $path; break
            }
          }
        }
        if ($source) {
          New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
          Copy-Item -LiteralPath $source -Destination $target -Force
          $reused++; $bytes += $entry.size
          continue
        }
        $shell = [PowerShell]::Create()
        $shell.RunspacePool = $pool
        [void]$shell.AddScript($DownloadWorker).AddArgument($site).AddArgument($Config.token).AddArgument($session.sessionId).AddArgument($entry.path).AddArgument([long]$entry.size).AddArgument($target)
        $jobs.Add(@{ shell = $shell; handle = $shell.BeginInvoke(); path = $entry.path })
      }

      while ($jobs.Count) {
        foreach ($job in $jobs.ToArray()) {
          if (-not $job.handle.IsCompleted) { continue }
          $outcome = @($job.shell.EndInvoke($job.handle)) | Select-Object -Last 1
          if (-not $outcome) {
            $problem = @($job.shell.Streams.Error) | Select-Object -First 1
            $outcome = @{ result = 'fail'; path = $job.path; status = "$problem" }
          }
          $job.shell.Dispose()
          [void]$jobs.Remove($job)
          switch ($outcome['result']) {
            'ok' { $copied++; $bytes += $outcome['size'] }
            'gone' { $gone++ }
            default { $failures.Add("$($outcome['status']) $($outcome['path'])") }
          }
        }
        if ($interactive) { ProgressLine ($copied + $reused + $gone + $failures.Count) $session.totalFiles $bytes $reused }
        Start-Sleep -Milliseconds 300
      }
      $cursor = if ($page.PSObject.Properties['nextCursor']) { $page.nextCursor } else { $null }
    } while ($cursor)
  } catch {
    try { Api 'DELETE' "/api/backup/session/$($session.sessionId)" | Out-Null } catch {}
    throw
  } finally {
    $pool.Close()
    $pool.Dispose()
  }
  if ($interactive) {
    ProgressLine ($copied + $reused + $gone + $failures.Count) $session.totalFiles $bytes $reused
    Say
  }

  if ($failures.Count) {
    Fail "$($failures.Count) file(s) could not be downloaded, for example:"
    $failures | Select-Object -First 3 | ForEach-Object { Say "  $_" 'DarkGray' }
    Say "  Everything already fetched stays in $staging and is reused next time." 'DarkGray'
    try { Api 'DELETE' "/api/backup/session/$($session.sessionId)" | Out-Null } catch {}
    return 1
  }

  $completed = Api 'POST' "/api/backup/session/$($session.sessionId)/complete" @{ fileCount = $copied + $reused; byteCount = $bytes }

  # Renamed into place only once everything is there: until this line the copy
  # is a .tmp- directory nothing mistakes for a backup.
  $final = Join-Path $destination "$Kind-$(StampFromMs $completed.completedAt)"
  Move-Item -LiteralPath $staging -Destination $final
  $removed = Rotate $destination

  $Config.lastRunAt = [string]$completed.completedAt
  $Config.lastFileCount = [string]$session.totalFiles
  $Config.lastByteCount = [string]$session.totalBytes
  ClearAlert
  WriteConfig

  $label = if ($Kind -eq 'auto') { 'Scheduled' } else { 'Manual' }
  $vanished = if ($gone) { ", $gone vanished" } else { '' }
  Ok "$label backup complete: $copied downloaded, $reused reused$vanished"
  Say "  $final"
  if ($removed) { Say "  rotated out: $($removed -join ', ')" 'DarkGray' }
  return 0
}

# Keep the newest scheduled copies, and every manual one. Runs after the new
# copy is in place, so there is never a moment without a complete backup.
function Rotate([string]$Destination) {
  $autos = @(Get-ChildItem -LiteralPath $Destination -Directory |
    Where-Object { $_.Name.StartsWith('auto-') } | Sort-Object Name -Descending)
  $doomed = @($autos | Select-Object -Skip $AutoKeep)
  foreach ($item in $doomed) { Remove-Item -LiteralPath $item.FullName -Recurse -Force }
  return @($doomed | ForEach-Object { $_.Name })
}

# The task fires daily; this decides whether a run is actually due. That is
# what lets a machine that was off catch up, and a manual backup restart the
# week without touching the scheduler.
function BackupDue {
  $last = [long]$Config.lastRunAt
  return ($last -le 0 -or ((NowMs) - $last) -ge $WeekMs)
}

# -------------------------------------------------------------- scheduling

function EscapeXml([string]$Value) { [Security.SecurityElement]::Escape($Value) }

function InstallSchedule([int]$Hour) {
  $arguments = "--run --auto --config `"$($State.ConfigPath)`""
  $start = '2020-01-01T{0:00}:00:00' -f $Hour
  # Created from XML rather than schtasks flags: only the XML form can set
  # StartWhenAvailable, which is what runs a backup missed while the machine
  # was off or restarting as soon as it is back.
  $xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Weekly Thei content backup.</Description>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>$start</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>true</RunOnlyIfNetworkAvailable>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT12H</ExecutionTimeLimit>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>$(EscapeXml $ScriptPath)</Command>
      <Arguments>$(EscapeXml $arguments)</Arguments>
      <WorkingDirectory>$(EscapeXml $ScriptDir)</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@
  $file = Join-Path ([IO.Path]::GetTempPath()) "thei-backup-task-$PID.xml"
  try {
    [IO.File]::WriteAllText($file, $xml, [Text.Encoding]::Unicode)
    $output = & cmd.exe /d /c "schtasks.exe /Create /TN `"$TaskName`" /XML `"$file`" /F 2>&1"
    if ($LASTEXITCODE -ne 0) { throw "schtasks: $output" }
  } finally {
    Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue
  }
  return "Task Scheduler task `"$TaskName`" (daily at ${Hour}:00, catches up after a restart)"
}

function RemoveSchedule {
  $output = & cmd.exe /d /c "schtasks.exe /Delete /TN `"$TaskName`" /F 2>&1"
  if ($LASTEXITCODE -ne 0) { throw "schtasks: $output" }
}

function ScheduleInstalled {
  & cmd.exe /d /c "schtasks.exe /Query /TN `"$TaskName`" >nul 2>&1"
  return ($LASTEXITCODE -eq 0)
}

# ------------------------------------------------------------------ status

function PrintStatus {
  Say
  Say '  State' 'White'
  Say "  Site         $(if ($Config.siteUrl) { $Config.siteUrl } else { 'not set' })"
  Say "  Destination  $(if ($Config.destination) { $Config.destination } else { 'not set' })"
  Write-Host '  Token        ' -NoNewline
  if ($Config.token) { Say 'set' 'Green' } else { Say 'not set' 'DarkGray' }
  Say "  Last backup  $(HumanAgo ([long]$Config.lastRunAt))"
  Write-Host '  Next due     ' -NoNewline
  if (BackupDue) { Say 'now' 'Yellow' } else {
    Say ([DateTimeOffset]::FromUnixTimeMilliseconds([long]$Config.lastRunAt + $WeekMs).LocalDateTime.ToString('yyyy-MM-dd HH:mm'))
  }
  Write-Host '  Schedule     ' -NoNewline
  if (ScheduleInstalled) { Say 'installed' 'Green' } else { Say 'not installed' 'DarkGray' }
  if ($Config.alert) { Say "  Alert        $($Config.alert)" 'Red' }

  if (-not $Config.destination) { return }
  $destination = DestinationPath
  Say
  $copies = @(if (Test-Path -LiteralPath $destination) {
      Get-ChildItem -LiteralPath $destination -Directory |
        Where-Object { $_.Name -match '^(auto|manual)-' } | Sort-Object Name -Descending
    })
  if (-not $copies.Count) { Say '  No copies yet.' 'DarkGray'; return }
  Say '  Copies' 'White'
  foreach ($copy in $copies) {
    $size = (Get-ChildItem -LiteralPath $copy.FullName -Recurse -File -Force | Measure-Object Length -Sum).Sum
    Say ('  {0,-30} {1,10}' -f $copy.Name, (HumanSize ([double]$size)))
  }
  Say '  Manual copies are never rotated out.' 'DarkGray'
}

function PrintRestore {
  $example = if ($Config.destination) { '<the auto-... folder from ' + (DestinationPath) + '>' } else { '/path/to/backup/auto-<timestamp>' }
  Say
  Say '  Restoring a copy' 'White'
  Say '  Upload the copy to the server, then as root:'
  Say
  Say '    systemctl stop thei' 'Cyan'
  Say '    mv /opt/thei/content /opt/thei/content.broken' 'Cyan'
  Say "    cp -a $example /opt/thei/content" 'Cyan'
  Say '    chown -R thei:thei /opt/thei/content' 'Cyan'
  Say '    systemctl start thei' 'Cyan'
  Say
  Say '  1. The service runs as the thei user; a copy unpacked as root needs the chown.'
  Say '  2. Restore onto the same engine version or a newer one.'
  Say '  3. generated-media/ and external-link-favicons/ are missing on purpose:'
  Say '     they are caches the site rebuilds on first use.'
}

# -------------------------------------------------------------------- menu

# Arrow keys and Enter, or the item's number. Returns the 1-based choice.
function Choose([string]$Title, [string[]]$Items) {
  $count = $Items.Count
  $canDraw = $true
  try { [void][Console]::CursorTop; if ([Console]::IsInputRedirected) { $canDraw = $false } } catch { $canDraw = $false }
  if (-not $canDraw) {
    Say "  $Title"
    for ($i = 0; $i -lt $count; $i++) { Say "  $($i + 1)  $($Items[$i])" }
    $answer = Read-Host '  >'
    $number = 0
    if ([int]::TryParse($answer, [ref]$number) -and $number -ge 1 -and $number -le $count) { return $number }
    return $count
  }

  Write-Host "  $Title  " -NoNewline -ForegroundColor White
  Write-Host 'Up/Down, Enter' -ForegroundColor DarkGray
  $selected = 0
  $cursorVisible = $true
  try { $cursorVisible = [Console]::CursorVisible; [Console]::CursorVisible = $false } catch {}
  try {
    for ($i = 0; $i -lt $count; $i++) { Write-Host '' }
    $top = [Console]::CursorTop - $count
    while ($true) {
      for ($i = 0; $i -lt $count; $i++) {
        [Console]::SetCursorPosition(0, $top + $i)
        $width = [Math]::Max([Console]::BufferWidth - 1, 20)
        if ($i -eq $selected) {
          $text = ("  > {0}  {1}" -f ($i + 1), $Items[$i])
          Write-Host $text.PadRight($width).Substring(0, $width) -NoNewline -ForegroundColor Black -BackgroundColor Cyan
        } else {
          $text = ("    {0}  {1}" -f ($i + 1), $Items[$i])
          Write-Host $text.PadRight($width).Substring(0, $width) -NoNewline
        }
      }
      $key = [Console]::ReadKey($true)
      switch ($key.Key) {
        'UpArrow' { $selected = ($selected + $count - 1) % $count }
        'DownArrow' { $selected = ($selected + 1) % $count }
        'Home' { $selected = 0 }
        'End' { $selected = $count - 1 }
        'Enter' { return $selected + 1 }
        'Escape' { return $count }
        default {
          $digit = 0
          if ([int]::TryParse([string]$key.KeyChar, [ref]$digit) -and $digit -ge 1 -and $digit -le $count) {
            return $digit
          }
        }
      }
    }
  } finally {
    try { [Console]::SetCursorPosition(0, $top + $count) } catch {}
    try { [Console]::CursorVisible = $cursorVisible } catch {}
    Write-Host ''
  }
}

function Ask([string]$Label, [string]$Current) {
  $prompt = if ($Current) { "  $Label [$Current]" } else { "  $Label" }
  $answer = Read-Host $prompt
  if ($answer) { return $answer.Trim() }
  return $Current
}

function Configure {
  Say
  $Config.siteUrl = (Ask 'Site address (https://example.com)' $Config.siteUrl).TrimEnd('/')
  $shown = if ($Config.token) { 'keep current' } else { '' }
  $token = Ask 'Backup token' $shown
  if ($token -ne 'keep current') { $Config.token = $token }
  $Config.destination = Ask 'Destination folder' $Config.destination
  $Config.clientLabel = Ask 'Name for this machine (optional)' $Config.clientLabel
  WriteConfig
  Ok "Saved to $($State.ConfigPath)"
}

function Banner {
  Say
  Write-Host '  Thei backup  ' -NoNewline -ForegroundColor Cyan
  Say $(if ($Config.siteUrl) { $Config.siteUrl } else { 'no site configured' }) 'DarkGray'
  if ($Config.alert) {
    Say
    Write-Host '  THE LAST BACKUP WAS STOPPED  ' -BackgroundColor DarkRed -ForegroundColor White
    Say "  $($Config.alert)" 'Red'
  }
  Say
}

function Menu {
  while ($true) {
    Banner
    $items = New-Object Collections.Generic.List[string]
    $items.Add('Back up now (manual copy, kept forever)')
    # Stopping again next week is the point of the alert, so the only way past
    # it is a backup that accepts the new size.
    if ($Config.alert) { $items.Add('Back up anyway (accept the smaller site)') }
    foreach ($item in @('Settings (site, token, destination)', 'Weekly schedule: install or remove', 'State and copies', 'How to restore', 'Quit')) {
      $items.Add($item)
    }
    $action = $items[(Choose 'What next?' $items.ToArray()) - 1]
    try {
      switch -Wildcard ($action) {
        'Back up*' {
          if (-not (ConfigComplete)) { Fail 'Set the site, token and destination first (Settings).'; break }
          [void](PerformBackup 'manual' ($action -like 'Back up anyway*'))
        }
        'Settings*' { Configure }
        'Weekly schedule*' {
          if (ScheduleInstalled) {
            if ((Choose 'A schedule is installed. Remove it?' @('Keep it', 'Remove it')) -eq 2) {
              RemoveSchedule
              Ok 'Schedule removed.'
            }
            break
          }
          if (-not (ConfigComplete)) { Fail 'Set the site, token and destination first (Settings).'; break }
          Say '  The task runs daily and backs up only when a week has passed,' 'DarkGray'
          Say '  so a machine that was off still catches up and a manual backup' 'DarkGray'
          Say '  restarts the week on its own.' 'DarkGray'
          $hour = 3
          $answer = Ask 'Hour of day, 0-23' '3'
          if (-not [int]::TryParse($answer, [ref]$hour) -or $hour -lt 0 -or $hour -gt 23) { $hour = 3 }
          Ok "Installed: $(InstallSchedule $hour)"
        }
        'State*' { PrintStatus }
        'How to restore' { PrintRestore }
        default { return }
      }
    } catch {
      Fail $_.Exception.Message
    }
  }
}

# -------------------------------------------------------------------- main

function Main([string[]]$Arguments) {
  $run = $false; $auto = $false; $force = $false; $status = $false
  for ($i = 0; $i -lt $Arguments.Count; $i++) {
    switch ($Arguments[$i]) {
      '--run' { $run = $true }
      '--auto' { $auto = $true }
      '--force' { $force = $true }
      '--status' { $status = $true }
      '--config' { $i++; if ($i -lt $Arguments.Count) { $State.ConfigPath = [IO.Path]::GetFullPath($Arguments[$i]) } }
    }
  }

  ReadConfig
  # A freshly downloaded script carries its site and token: keep them.
  if (-not (Test-Path -LiteralPath $($State.ConfigPath)) -and $Config.siteUrl) { WriteConfig }

  if ($status) { PrintStatus; return 0 }

  if ($run) {
    if (-not (ConfigComplete)) {
      Fail "Nothing configured in $($State.ConfigPath). Run without --run to set it up."
      return 1
    }
    if ($auto -and -not (BackupDue)) {
      Say "Not due yet; last backup $(HumanAgo ([long]$Config.lastRunAt))." 'DarkGray'
      return 0
    }
    $kind = if ($auto) { 'auto' } else { 'manual' }
    $code = 1
    try {
      # A function's return value comes last in its output.
      $code = @(PerformBackup $kind $force)[-1]
    } catch {
      Fail $_.Exception.Message
      if ($env:THEI_BACKUP_DEBUG) { Say $_.ScriptStackTrace 'DarkGray' }
    }
    if ($code -eq 2 -and -not [Console]::IsInputRedirected) {
      # Leave the window open: a scheduled run has no one watching otherwise.
      Say
      Read-Host '  Press Enter to close' | Out-Null
    }
    return $code
  }

  Menu
  return 0
}

# Arguments come through an environment variable: powershell.exe -Command
# would join them into one string and lose the quotes around a path.
$arguments = @(
  [regex]::Matches([string]$env:THEI_BACKUP_ARGS, '"([^"]*)"|(\S+)') |
    ForEach-Object { if ($_.Groups[1].Success) { $_.Groups[1].Value } else { $_.Groups[2].Value } }
)
exit ([int]@(Main $arguments)[-1])
