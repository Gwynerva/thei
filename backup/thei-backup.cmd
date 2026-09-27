<# :
@echo off
rem Thei backup client for Windows. Double-click for the menu, or pass flags:
rem   thei-backup.cmd --run                    back up now, as a manual copy
rem   thei-backup.cmd --run --auto             back up if the interval has passed
rem   thei-backup.cmd --run --force            back up even if the site shrank sharply
rem   thei-backup.cmd --status                 print the current state and exit
rem   thei-backup.cmd --install-schedule [H]   run daily at hour H (default 3)
rem   thei-backup.cmd --remove-schedule        remove the schedule
rem   thei-backup.cmd --config <path>          use a different settings file
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

$DayMs = [long](24 * 60 * 60 * 1000)
# The task fires at a fixed hour and a run ends minutes later, so "a whole
# interval since the last one" would slip a day each time. Half a day of slack
# keeps a weekly backup weekly.
$DueSlackMs = [long](12 * 60 * 60 * 1000)
$ParallelDownloads = 6
$ConfigKeys = @('siteUrl', 'token', 'destination', 'clientLabel', 'keepCount', 'intervalDays', 'shrinkPercent', 'alertCommand', 'lastRunAt', 'lastFileCount', 'lastByteCount', 'lastCounts', 'alert', 'bakedToken')
$ConfigDefaults = @{ keepCount = '3'; intervalDays = '7'; shrinkPercent = '30'; lastRunAt = '0'; lastFileCount = '0'; lastByteCount = '0' }
$Invariant = [Globalization.CultureInfo]::InvariantCulture

$ScriptPath = $env:THEI_BACKUP_SCRIPT
$ScriptDir = Split-Path -Parent $ScriptPath
# Everything that changes lives in one object: this code runs as a script block,
# where script-scoped variables would not be these ones.
$State = @{
  ConfigPath = Join-Path $ScriptDir 'thei-backup.conf'
  Http = $null
  AdoptedToken = $false
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
  if ($unit -gt 0 -and $Bytes -lt 10) { return $Bytes.ToString('0.0', $Invariant) + ' ' + $units[$unit] }
  return $Bytes.ToString('0', $Invariant) + ' ' + $units[$unit]
}

function NowMs { [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }

function HumanAgo([long]$ThenMs) {
  if ($ThenMs -le 0) { return 'never' }
  $days = [Math]::Floor(((NowMs) - $ThenMs) / 86400000)
  if ($days -le 0) { return 'today' }
  if ($days -eq 1) { return 'yesterday' }
  return "$days days ago"
}

# Sortable, filename-safe and unambiguous across time zones and calendars.
function StampFromMs([long]$Ms) {
  [DateTimeOffset]::FromUnixTimeMilliseconds($Ms).UtcDateTime.ToString("yyyyMMdd'T'HHmmss'Z'", $Invariant)
}

function LocalTimeFromMs([long]$Ms) {
  [DateTimeOffset]::FromUnixTimeMilliseconds($Ms).LocalDateTime.ToString('yyyy-MM-dd HH:mm', $Invariant)
}

# Whether a file is what its path promises. Files under assets/ are named by
# the SHA-256 of their bytes, so a damaged one is caught here — whether it just
# arrived or has sat in an older copy for months. Other files carry no hash.
function FileIntact([string]$File, [string]$Path, [long]$Size) {
  if (-not [IO.File]::Exists($File)) { return $false }
  if ((New-Object IO.FileInfo $File).Length -ne $Size) { return $false }
  if (-not $Path.StartsWith('assets/')) { return $true }
  $name = $Path.Substring($Path.LastIndexOf('/') + 1)
  $expected = $name.Split('.')[0]
  $sha = [Security.Cryptography.SHA256]::Create()
  $stream = [IO.File]::OpenRead($File)
  try {
    $hash = -join ($sha.ComputeHash($stream) | ForEach-Object { $_.ToString('x2') })
  } finally {
    $stream.Dispose()
    $sha.Dispose()
  }
  return ($hash -eq $expected)
}

# ---------------------------------------------------------------- settings

$Config = [ordered]@{}

function IsPlaceholder([string]$Value) { $Value -like '__THEI_*__' }

function WholeNumber([string]$Value, [string]$Fallback) {
  $number = 0L
  if ([long]::TryParse($Value, [Globalization.NumberStyles]::None, $Invariant, [ref]$number)) { return [string]$number }
  return $Fallback
}

function ReadConfig {
  foreach ($key in $ConfigKeys) { $Config[$key] = '' }
  if (Test-Path -LiteralPath $($State.ConfigPath)) {
    foreach ($line in [IO.File]::ReadAllLines($($State.ConfigPath), [Text.Encoding]::UTF8)) {
      $index = $line.IndexOf('=')
      if ($index -lt 1) { continue }
      $key = $line.Substring(0, $index)
      if ($ConfigKeys -contains $key) { $Config[$key] = $line.Substring($index + 1).TrimEnd("`r") }
    }
  }
  # The address the script was downloaded with, unless one was set since.
  if (-not $Config.siteUrl -and -not (IsPlaceholder $DefaultSiteUrl)) { $Config.siteUrl = $DefaultSiteUrl }
  # A script downloaded right after generating a token carries it, and that
  # token is newer than whatever an older settings file says — once. A token
  # typed into Settings later wins over the one the script was born with.
  if (-not (IsPlaceholder $DefaultToken) -and $DefaultToken -ne $Config.bakedToken) {
    $Config.token = $DefaultToken
    $Config.bakedToken = $DefaultToken
    $State.AdoptedToken = $true
  }
  foreach ($key in $ConfigDefaults.Keys) { $Config[$key] = WholeNumber $Config[$key] $ConfigDefaults[$key] }
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

# Every scheduler entry is named after the settings file, so each site backed
# up from this machine gets a task of its own.
function TaskName {
  $base = [IO.Path]::GetFileNameWithoutExtension($State.ConfigPath)
  if ($base -eq 'thei-backup') { return 'Thei Backup' }
  return "Thei Backup ($($base -replace '[^A-Za-z0-9_-]', '-'))"
}

# --------------------------------------------------------------------- api

Add-Type -AssemblyName System.Net.Http
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch {}
# .NET Framework allows two connections per host unless told otherwise, which
# would leave most parallel downloads waiting.
[Net.ServicePointManager]::DefaultConnectionLimit = [Math]::Max([Net.ServicePointManager]::DefaultConnectionLimit, $ParallelDownloads * 2)

function Client {
  if (-not $State.Http) {
    $handler = New-Object Net.Http.HttpClientHandler
    # A redirect would carry the token to another address, and turn a POST
    # into a GET on the way: the site address must be the final one.
    $handler.AllowAutoRedirect = $false
    $State.Http = New-Object Net.Http.HttpClient $handler
    $State.Http.Timeout = [TimeSpan]::FromMinutes(10)
  }
  $State.Http.DefaultRequestHeaders.Remove('x-thei-backup-token') | Out-Null
  $State.Http.DefaultRequestHeaders.Add('x-thei-backup-token', $Config.token)
  return $State.Http
}

function ApiFailure([string]$What, [int]$Status, [string]$Detail) {
  if ($Status -ge 300 -and $Status -lt 400) { return "$What failed: the site redirects elsewhere (HTTP $Status). Set its final address, with https://, in Settings." }
  switch ($Status) {
    403 { return "$What failed: the site refused the token. Generate a new one in Settings -> Backups." }
    409 { return "$What failed: another backup of this site is running. Try again later." }
    503 { return "$What failed: the site is updating or not ready. Try again later." }
  }
  return "$What failed: HTTP $Status $Detail"
}

function Api([string]$Method, [string]$Path, $Body = $null, [string]$What = 'A request') {
  $request = New-Object Net.Http.HttpRequestMessage ([Net.Http.HttpMethod]::new($Method)), ((SiteBase) + $Path)
  if ($null -ne $Body) {
    $json = $Body | ConvertTo-Json -Compress
    $request.Content = New-Object Net.Http.StringContent $json, ([Text.Encoding]::UTF8), 'application/json'
  }
  try {
    $response = (Client).SendAsync($request).GetAwaiter().GetResult()
  } catch {
    throw "$What failed: the site did not answer ($($_.Exception.InnerException.Message))."
  }
  try {
    $text = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if (-not $response.IsSuccessStatusCode) {
      $detail = if ($text.Length -gt 200) { $text.Substring(0, 200) } else { $text }
      throw (ApiFailure $What ([int]$response.StatusCode) $detail)
    }
    if ($text) { return ($text | ConvertFrom-Json) }
    return $null
  } finally {
    $response.Dispose()
    $request.Dispose()
  }
}

# ------------------------------------------------------------------ backup

# Downloads one file to "<target>.part" in a runspace of its own; returns 'ok',
# 'gone' or 'fail'. The caller checks what arrived and moves it into place.
$DownloadWorker = {
  param($SiteBase, $Token, $SessionId, $Path, $Size, $Target)
  Add-Type -AssemblyName System.Net.Http
  $part = "$Target.part"
  $client = $null
  try {
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($Target)) | Out-Null
    # Only a file named by its hash can resume from an earlier attempt: the
    # database and the config are new bytes in every session.
    $have = 0
    if ([IO.File]::Exists($part)) {
      $have = (New-Object IO.FileInfo $part).Length
      if ($have -gt $Size -or -not $Path.StartsWith('assets/')) { [IO.File]::Delete($part); $have = 0 }
    }
    if ($have -lt $Size -or $Size -eq 0) {
      $handler = New-Object Net.Http.HttpClientHandler
      $handler.AllowAutoRedirect = $false
      $client = New-Object Net.Http.HttpClient $handler
      $client.Timeout = [TimeSpan]::FromHours(2)
      $client.DefaultRequestHeaders.Add('x-thei-backup-token', $Token)
      $url = "$SiteBase/api/backup/session/$SessionId/file?path=$([Uri]::EscapeDataString($Path))"
      $status = 0
      $response = $null
      # A blip in the connection should not cost a whole weekly run.
      for ($attempt = 1; $attempt -le 3; $attempt++) {
        $request = New-Object Net.Http.HttpRequestMessage ([Net.Http.HttpMethod]::Get), $url
        if ($have -gt 0) { [void]$request.Headers.TryAddWithoutValidation('Range', "bytes=$have-") }
        try {
          $response = $client.SendAsync($request, [Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
          $status = [int]$response.StatusCode
          if ($status -lt 500) { break }
          $response.Dispose(); $response = $null
        } catch {
          if ($attempt -eq 3) { throw }
        }
        Start-Sleep -Seconds 2
      }
      if ($status -eq 404) {
        if ([IO.File]::Exists($part)) { [IO.File]::Delete($part) }
        if ($response) { $response.Dispose() }
        return @{ result = 'gone'; path = $Path }
      }
      if ($status -ne 200 -and $status -ne 206) {
        if ($response) { $response.Dispose() }
        return @{ result = 'fail'; path = $Path; status = $status }
      }
      $mode = if ($status -eq 206) { [IO.FileMode]::Append } else { [IO.FileMode]::Create }
      $stream = New-Object IO.FileStream $part, $mode, ([IO.FileAccess]::Write)
      try {
        $response.Content.CopyToAsync($stream).GetAwaiter().GetResult()
      } finally {
        $stream.Dispose()
        $response.Dispose()
      }
    }
    return @{ result = 'ok'; path = $Path; size = $Size; part = $part; target = $Target }
  } catch {
    return @{ result = 'fail'; path = $Path; status = $_.Exception.Message }
  } finally {
    if ($client) { $client.Dispose() }
  }
}

# Earlier copies, newest first: each can supply files that did not change.
function ReuseSources([string]$Destination) {
  if (-not (Test-Path -LiteralPath $Destination)) { return @() }
  @(Get-ChildItem -LiteralPath $Destination -Directory -Force |
    Where-Object { $_.Name -match '^(auto|manual)-' } |
    Sort-Object { $_.Name.Substring($_.Name.IndexOf('-') + 1) } -Descending | ForEach-Object { $_.FullName })
}

# A file that did not change is shared with the copy it came from rather than
# stored again, so a weekly copy costs only what changed. Where links cannot
# be made — another drive, FAT — it is copied.
function LinkOrCopy([string]$Source, [string]$Target) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Target) | Out-Null
  try {
    New-Item -ItemType HardLink -Path $Target -Value $Source -ErrorAction Stop | Out-Null
  } catch {
    Copy-Item -LiteralPath $Source -Destination $Target -Force
  }
}

function ShrinkPercent([long]$Before, [long]$After) {
  if ($Before -le 0 -or $After -ge $Before) { return 0 }
  return [int][Math]::Floor(($Before - $After) * 100 / $Before)
}

# What the site lost since the last backup that it plausibly did not mean
# to: a share of its files or bytes, or of any kind of entity. Empty if none.
function ShrinkReport($Session, [string]$Counts) {
  $limit = [int]$Config.shrinkPercent
  $parts = New-Object Collections.Generic.List[string]
  $lastFiles = [long]$Config.lastFileCount
  $lastBytes = [long]$Config.lastByteCount
  if ($lastFiles -gt 0) {
    $filesLost = ShrinkPercent $lastFiles $Session.totalFiles
    $bytesLost = ShrinkPercent $lastBytes $Session.totalBytes
    if ($filesLost -gt $limit -or $bytesLost -gt $limit) {
      $parts.Add("files $lastFiles -> $($Session.totalFiles) (-$filesLost%), size $(HumanSize $lastBytes) -> $(HumanSize $Session.totalBytes) (-$bytesLost%)")
    }
  }
  # Deleting a couple of entries is ordinary; losing a share of them, and more
  # than two, is not.
  $now = @{}
  foreach ($pair in $Counts.Split(',')) { if ($pair -match '^(\w+):(\d+)$') { $now[$Matches[1]] = [long]$Matches[2] } }
  foreach ($pair in ([string]$Config.lastCounts).Split(',')) {
    if ($pair -notmatch '^(\w+):(\d+)$') { continue }
    $entity = $Matches[1]; $before = [long]$Matches[2]
    if (-not $now.ContainsKey($entity)) { continue }
    $after = $now[$entity]
    if ($before - $after -gt 2 -and (ShrinkPercent $before $after) -gt $limit) { $parts.Add("$entity $before -> $after") }
  }
  return ($parts -join '; ')
}

function NotifyAlert([string]$Message) {
  $destination = DestinationPath
  try {
    New-Item -ItemType Directory -Force -Path $destination | Out-Null
    $text = @(
      "Thei backup stopped on $([DateTime]::Now.ToString('yyyy-MM-dd HH:mm', $Invariant)).",
      '',
      $Message,
      '',
      'No copy was made and no old copy was removed. If the site really',
      'lost this much on purpose, run the backup client and choose',
      '"Back up anyway" to accept the new size.'
    )
    [IO.File]::WriteAllLines((Join-Path $destination 'ALERT.txt'), [string[]]$text)
  } catch {}
  if ($Config.alertCommand) {
    try {
      $env:THEI_BACKUP_ALERT = $Message
      & cmd.exe /d /c $Config.alertCommand | Out-Null
    } catch { Warn 'The alert command failed.' }
  }
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
  $session = Api 'POST' '/api/backup/session' $body 'Opening a session'
  # Whatever stops this run from here on releases the session at once, so the
  # next attempt is not refused for hours.
  $open = $true
  try {
    if (@($session.skipped).Count) {
      Warn "Not part of a backup, left in place: $(@($session.skipped) -join ', ')"
    }
    Info "$($session.totalFiles) file(s), $(HumanSize $session.totalBytes)"
    $counts = ''
    if ($session.PSObject.Properties['counts'] -and $session.counts) {
      $counts = (@($session.counts.PSObject.Properties) | ForEach-Object { "$($_.Name):$($_.Value)" }) -join ','
    }

    if (-not $Force) {
      $report = ShrinkReport $session $counts
      if ($report) {
        # Released before the dialog, which waits for a person.
        try { Api 'DELETE' "/api/backup/session/$($session.sessionId)" | Out-Null } catch {}
        $open = $false
        $Config.alert = "$([DateTime]::UtcNow.ToString("yyyy-MM-dd'T'HH:mm'Z'", $Invariant)) $report"
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

    # One staging folder for every attempt: what a failed run fetched is picked
    # up by the next one instead of piling up.
    $staging = Join-Path $destination '.partial'
    New-Item -ItemType Directory -Force -Path $staging | Out-Null
    $sources = ReuseSources $destination
    $listed = New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)

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
        $page = Api 'GET' "/api/backup/session/$($session.sessionId)/manifest?$query" $null 'Reading the file list'
        $jobs = New-Object Collections.Generic.List[object]
        foreach ($entry in @($page.entries)) {
          $relative = $entry.path -replace '/', '\'
          $target = Join-Path $staging $relative
          [void]$listed.Add($relative)
          # Only assets/ is addressed by the hash of its bytes, so only there a
          # file already on this machine can stand for the one on the site.
          $source = $null
          if ($entry.path.StartsWith('assets/')) {
            if (FileIntact $target $entry.path $entry.size) { $reused++; $bytes += $entry.size; continue }
            if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Force }
            foreach ($candidate in $sources) {
              $path = Join-Path $candidate $relative
              if (FileIntact $path $entry.path $entry.size) { $source = $path; break }
            }
          } elseif (Test-Path -LiteralPath $target) {
            Remove-Item -LiteralPath $target -Force
          }
          if ($source) {
            LinkOrCopy $source $target
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
              'ok' {
                if (FileIntact $outcome['part'] $outcome['path'] $outcome['size']) {
                  if ([IO.File]::Exists($outcome['target'])) { [IO.File]::Delete($outcome['target']) }
                  [IO.File]::Move($outcome['part'], $outcome['target'])
                  $copied++; $bytes += $outcome['size']
                } else {
                  if ([IO.File]::Exists($outcome['part'])) { [IO.File]::Delete($outcome['part']) }
                  $failures.Add("damaged in transfer $($outcome['path'])")
                }
              }
              'gone' {
                # Reclaimed by the site's own cleanup after the snapshot: garbage
                # the snapshot does not depend on — but never the database.
                if ($outcome['path'] -match '^(assets|external-link-favicons)/') { $gone++ }
                else { $failures.Add("404 $($outcome['path'])") }
              }
              default { $failures.Add("$($outcome['status']) $($outcome['path'])") }
            }
          }
          if ($interactive) { ProgressLine ($copied + $reused + $gone + $failures.Count) $session.totalFiles $bytes $reused }
          Start-Sleep -Milliseconds 300
        }
        $cursor = if ($page.PSObject.Properties['nextCursor']) { $page.nextCursor } else { $null }
      } while ($cursor)
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
      Say "  What was fetched stays in $staging and is picked up next time." 'DarkGray'
      return 1
    }
    # Every listed file has to be accounted for.
    if (($copied + $gone + $reused) -ne [long]$session.totalFiles) {
      Fail "Only $($copied + $gone + $reused) of $($session.totalFiles) file(s) were accounted for."
      return 1
    }

    # Whatever an earlier attempt left in staging that this session did not
    # list is not part of the copy.
    foreach ($file in @(Get-ChildItem -LiteralPath $staging -Recurse -File -Force)) {
      $relative = $file.FullName.Substring($staging.Length + 1)
      if ($file.Name.EndsWith('.part') -or -not $listed.Contains($relative)) { Remove-Item -LiteralPath $file.FullName -Force }
    }

    # Renamed into place only once everything is there: until this line the
    # copy is a staging folder nothing mistakes for a backup. The site records
    # the backup only after that.
    $final = Join-Path $destination "$Kind-$(StampFromMs (NowMs))"
    if (Test-Path -LiteralPath $final) { $final = "$final-$PID" }
    Move-Item -LiteralPath $staging -Destination $final

    $completedAt = NowMs
    try {
      $completed = Api 'POST' "/api/backup/session/$($session.sessionId)/complete" @{ fileCount = $copied + $reused; byteCount = $bytes } 'Completing the session'
      $open = $false
      if ($completed -and $completed.completedAt) { $completedAt = [long]$completed.completedAt }
    } catch {
      Warn "The copy is complete, but the site could not record it: $($_.Exception.Message)"
    }
    $removed = Rotate $destination
    # Staging from before one folder was reused for every attempt.
    Get-ChildItem -LiteralPath $destination -Directory -Force |
      Where-Object { $_.Name.StartsWith('.tmp-') } |
      ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force }

    $Config.lastRunAt = [string]$completedAt
    $Config.lastFileCount = [string]$session.totalFiles
    $Config.lastByteCount = [string]$session.totalBytes
    $Config.lastCounts = $counts
    ClearAlert
    WriteConfig

    $label = if ($Kind -eq 'auto') { 'Scheduled' } else { 'Manual' }
    $vanished = if ($gone) { ", $gone vanished" } else { '' }
    Ok "$label backup complete: $copied downloaded, $reused reused$vanished"
    Say "  $final"
    if ($removed) { Say "  rotated out: $($removed -join ', ')" 'DarkGray' }
    return 0
  } finally {
    if ($open) {
      try { Api 'DELETE' "/api/backup/session/$($session.sessionId)" | Out-Null } catch {}
    }
  }
}

# Keep the newest scheduled copies, and every manual one. Runs after the new
# copy is in place, so there is never a moment without a complete backup.
function Rotate([string]$Destination) {
  $autos = @(Get-ChildItem -LiteralPath $Destination -Directory |
    Where-Object { $_.Name.StartsWith('auto-') } | Sort-Object Name -Descending)
  $doomed = @($autos | Select-Object -Skip ([int]$Config.keepCount))
  foreach ($item in $doomed) { Remove-Item -LiteralPath $item.FullName -Recurse -Force }
  return @($doomed | ForEach-Object { $_.Name })
}

function IntervalMs { [long]$Config.intervalDays * $DayMs }

# The task fires daily; this decides whether a run is actually due. That is
# what lets a machine that was off catch up, and a manual backup restart the
# interval without touching the scheduler.
function BackupDue {
  $last = [long]$Config.lastRunAt
  return ($last -le 0 -or ((NowMs) - $last) -ge ((IntervalMs) - $DueSlackMs))
}

# -------------------------------------------------------------- scheduling

function EscapeXml([string]$Value) { [Security.SecurityElement]::Escape($Value) }

function InstallSchedule([int]$Hour) {
  $name = TaskName
  $arguments = "--run --auto --config `"$($State.ConfigPath)`""
  $start = '2020-01-01T{0:00}:00:00' -f $Hour
  # Created from XML rather than schtasks flags: only the XML form can set
  # StartWhenAvailable, which is what runs a backup missed while the machine
  # was off or restarting as soon as it is back.
  $xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Scheduled Thei content backup.</Description>
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
    $output = & cmd.exe /d /c "schtasks.exe /Create /TN `"$name`" /XML `"$file`" /F 2>&1"
    if ($LASTEXITCODE -ne 0) { throw "schtasks: $output" }
  } finally {
    Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue
  }
  return "Task Scheduler task `"$name`" (daily at ${Hour}:00 while you are signed in, catches up after a restart)"
}

function RemoveSchedule {
  $name = TaskName
  $output = & cmd.exe /d /c "schtasks.exe /Delete /TN `"$name`" /F 2>&1"
  if ($LASTEXITCODE -ne 0) { throw "schtasks: $output" }
}

function ScheduleInstalled {
  $name = TaskName
  & cmd.exe /d /c "schtasks.exe /Query /TN `"$name`" >nul 2>&1"
  return ($LASTEXITCODE -eq 0)
}

# A whole hour 0-23, leading zeros welcome; 3 for anything else.
function ParseHour([string]$Value) {
  $hour = 0
  if ([int]::TryParse($Value, [Globalization.NumberStyles]::None, $Invariant, [ref]$hour) -and $hour -ge 0 -and $hour -le 23) { return $hour }
  return 3
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
    Say (LocalTimeFromMs ([long]$Config.lastRunAt + (IntervalMs) - $DueSlackMs))
  }
  Say "  Keeps        $($Config.keepCount) scheduled copies, every $($Config.intervalDays) day(s)"
  Write-Host '  Schedule     ' -NoNewline
  if (ScheduleInstalled) { Say "installed ($(TaskName))" 'Green' } else { Say 'not installed' 'DarkGray' }
  if ($Config.alert) { Say "  Alert        $($Config.alert)" 'Red' }

  if (-not $Config.destination) { return }
  $destination = DestinationPath
  Say
  $copies = @(if (Test-Path -LiteralPath $destination) {
      Get-ChildItem -LiteralPath $destination -Directory |
        Where-Object { $_.Name -match '^(auto|manual)-' } |
        Sort-Object { $_.Name.Substring($_.Name.IndexOf('-') + 1) } -Descending
    })
  if (-not $copies.Count) { Say '  No copies yet.' 'DarkGray'; return }
  Say '  Copies' 'White'
  foreach ($copy in $copies) {
    $size = (Get-ChildItem -LiteralPath $copy.FullName -Recurse -File -Force | Measure-Object Length -Sum).Sum
    Say ('  {0,-30} {1,10}' -f $copy.Name, (HumanSize ([double]$size)))
  }
  if (Test-Path -LiteralPath (Join-Path $destination '.partial')) {
    Say '  An unfinished copy waits in .partial and is picked up next time.' 'DarkGray'
  }
  Say '  Manual copies are never rotated out. Files that did not change are' 'DarkGray'
  Say '  shared between copies, so sizes overlap; each copy is complete.' 'DarkGray'
}

function PrintRestore {
  $example = if ($Config.destination) { '<the auto-... folder from ' + (DestinationPath) + '>' } else { '/path/to/backup/auto-<timestamp>' }
  Say
  Say '  Restoring a copy' 'White'
  Say "  Upload $example to the server, then there, as root:"
  Say
  Say '    systemctl stop thei' 'Cyan'
  Say '    mv /opt/thei/content /opt/thei/content.broken' 'Cyan'
  Say '    cp -a <the copy> /opt/thei/content' 'Cyan'
  Say '    chown -R thei:thei /opt/thei/content' 'Cyan'
  Say '    systemctl start thei' 'Cyan'
  Say
  Say '  1. The service runs as the thei user; a copy unpacked as root needs the chown.'
  Say '  2. Restore onto the same engine version or a newer one. To go back to an'
  Say '     older version, install that version first, then restore its copy.'
  Say '  3. generated-media/ is missing on purpose: it is a cache the site'
  Say '     rebuilds on first use.'
  Say '  4. Generate a new backup token afterwards: the restored site knows the'
  Say '     token it had when the copy was made.'
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
  $Config.keepCount = [string][Math]::Max(1, [long](WholeNumber (Ask 'Scheduled copies to keep' $Config.keepCount) '3'))
  $Config.intervalDays = [string][Math]::Max(1, [long](WholeNumber (Ask 'Days between scheduled copies' $Config.intervalDays) '7'))
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
    # Stopping again next time is the point of the alert, so the only way past
    # it is a backup that accepts the new size.
    if ($Config.alert) { $items.Add('Back up anyway (accept the smaller site)') }
    foreach ($item in @('Settings (site, token, destination, rotation)', 'Schedule: install or remove', 'State and copies', 'How to restore', 'Quit')) {
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
        'Schedule*' {
          if (ScheduleInstalled) {
            if ((Choose 'A schedule is installed. Remove it?' @('Keep it', 'Remove it')) -eq 2) {
              RemoveSchedule
              Ok 'Schedule removed.'
            }
            break
          }
          if (-not (ConfigComplete)) { Fail 'Set the site, token and destination first (Settings).'; break }
          Say "  The task runs daily and backs up only when $($Config.intervalDays) day(s) have passed," 'DarkGray'
          Say '  so a machine that was off still catches up and a manual backup' 'DarkGray'
          Say '  restarts the interval on its own.' 'DarkGray'
          $hour = ParseHour (Ask 'Hour of day, 0-23' '3')
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
  $run = $false; $auto = $false; $force = $false; $status = $false; $schedule = ''; $hour = ''
  for ($i = 0; $i -lt $Arguments.Count; $i++) {
    switch ($Arguments[$i]) {
      '--run' { $run = $true }
      '--auto' { $auto = $true }
      '--force' { $force = $true }
      '--status' { $status = $true }
      '--install-schedule' {
        $schedule = 'install'
        if ($i + 1 -lt $Arguments.Count -and $Arguments[$i + 1] -match '^\d+$') { $i++; $hour = $Arguments[$i] }
      }
      '--remove-schedule' { $schedule = 'remove' }
      '--config' { $i++; if ($i -lt $Arguments.Count) { $State.ConfigPath = [IO.Path]::GetFullPath($Arguments[$i]) } }
      { $_ -in @('-h', '--help', '/?') } {
        Get-Content -LiteralPath $ScriptPath -TotalCount 10 | Select-Object -Skip 2 | ForEach-Object { Say ($_ -replace '^rem ?', '') }
        return 0
      }
      default { Fail "Unknown option: $($Arguments[$i]) (see --help)"; return 1 }
    }
  }

  $existed = Test-Path -LiteralPath $($State.ConfigPath)
  ReadConfig
  # A freshly downloaded script carries its site and token: keep them.
  if ((-not $existed -and $Config.siteUrl) -or $State.AdoptedToken) { WriteConfig }

  if ($status) { PrintStatus; return 0 }

  if ($schedule -eq 'install') {
    if (-not (ConfigComplete)) { Fail "Nothing configured in $($State.ConfigPath). Run without options to set it up."; return 1 }
    try { Ok "Installed: $(InstallSchedule (ParseHour $hour))"; return 0 } catch { Fail $_.Exception.Message; return 1 }
  }
  if ($schedule -eq 'remove') {
    if (ScheduleInstalled) { RemoveSchedule; Ok 'Schedule removed.' } else { Info 'No schedule to remove.' }
    return 0
  }

  if ($run) {
    if (-not (ConfigComplete)) {
      Fail "Nothing configured in $($State.ConfigPath). Run without --run to set it up."
      return 1
    }
    if ($auto -and -not (BackupDue)) {
      Say "Not due yet; last backup $(HumanAgo ([long]$Config.lastRunAt))." 'DarkGray'
      return 0
    }
    # A scheduled run has nobody watching: it keeps a log beside the settings.
    $logging = $false
    if ($auto) {
      try {
        Start-Transcript -LiteralPath ([IO.Path]::ChangeExtension($State.ConfigPath, '.log')) -Append | Out-Null
        $logging = $true
      } catch {}
    }
    $kind = if ($auto) { 'auto' } else { 'manual' }
    $code = 1
    try {
      # A function's return value comes last in its output.
      $code = @(PerformBackup $kind $force)[-1]
    } catch {
      Fail $_.Exception.Message
      if ($env:THEI_BACKUP_DEBUG) { Say $_.ScriptStackTrace 'DarkGray' }
    } finally {
      if ($logging) { try { Stop-Transcript | Out-Null } catch {} }
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
