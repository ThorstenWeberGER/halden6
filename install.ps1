<#
.SYNOPSIS
  Builds the Halden 6 VST3 plugin from this repository and installs it for Ableton Live.

.DESCRIPTION
  Asks a few questions (press Enter for the default), builds with CMake and
  Visual Studio 2022, and copies the plugin into a VST3 folder. Every question
  has a flag, and -Yes takes all defaults, so repeat installs and CI run
  without questions. Double-click install.cmd to run it.

.EXAMPLE
  .\install.ps1                     # ask, build, install
  .\install.ps1 -Yes                # defaults: current checkout, stable, system VST3 folder
  .\install.ps1 -Channel Dev -Yes   # "Halden 6 Dev", next to the stable one
  .\install.ps1 -BuildOnly -Yes     # build and write the release zip (CI)
  .\install.ps1 -Uninstall          # remove what the last install put in place
#>
[CmdletBinding()]
param(
  [string]$Ref,                                  # "", "latest" or a tag / branch
  [ValidateSet('', 'Stable', 'Dev')][string]$Channel = '',
  [string]$Target,                               # VST3 folder
  [switch]$Yes,
  [switch]$Validate,
  [switch]$BuildOnly,
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$SystemVst3 = Join-Path $env:CommonProgramFiles 'VST3'
$StateDir = Join-Path $env:LOCALAPPDATA 'Halden6'
$StateFile = Join-Path $StateDir 'install.json'

function Say($text) { Write-Host $text }
function Step($text) { Write-Host ''; Write-Host "== $text" -ForegroundColor Cyan }
function Fail($text) { Write-Host ''; Write-Host "Stopped: $text" -ForegroundColor Red; exit 1 }

# Ask a question with numbered choices; Enter or -Yes picks the first
function Ask($question, [string[]]$choices) {
  if ($Yes) { return 0 }
  Say ''
  Say $question
  for ($i = 0; $i -lt $choices.Count; $i++) { Say ("  {0}) {1}{2}" -f ($i + 1), $choices[$i], $(if ($i -eq 0) { '  (default)' } else { '' })) }
  while ($true) {
    $a = Read-Host 'Choice'
    if ($a -eq '') { return 0 }
    $n = 0
    if ([int]::TryParse($a, [ref]$n) -and $n -ge 1 -and $n -le $choices.Count) { return $n - 1 }
  }
}

# Run a native command whose stderr chatter should not stop the script
# (Windows PowerShell 5.1 turns redirected stderr into errors)
function Invoke-Quiet([scriptblock]$cmd) {
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { & $cmd 2>&1 | Out-Null } finally { $ErrorActionPreference = $old }
}

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  return (New-Object Security.Principal.WindowsPrincipal $id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Run a short PowerShell script as admin (one UAC prompt) unless we already are
function Invoke-Elevated([string]$script) {
  if (Test-Admin) { & ([scriptblock]::Create($script)); return }
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes("`$ErrorActionPreference='Stop'; $script"))
  $p = Start-Process powershell -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile', '-EncodedCommand', $encoded
  if ($p.ExitCode -ne 0) { Fail 'the step that needed admin rights did not finish (UAC declined?)' }
}

function Wait-LiveClosed {
  while (Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like 'Ableton Live*' }) {
    Say 'Ableton Live is running and locks loaded plugins. Close Live, then press Enter.'
    if ($Yes) { Fail 'Ableton Live is running' }
    Read-Host | Out-Null
  }
}

# ---------------------------------------------------------------- uninstall
if ($Uninstall) {
  if (-not (Test-Path $StateFile)) { Fail "no install recorded in $StateFile" }
  $rec = Get-Content $StateFile -Raw | ConvertFrom-Json
  $path = $rec.path
  if (-not ($path -like '*Halden 6*.vst3')) { Fail "unexpected path in install.json: $path" }
  Wait-LiveClosed
  if (Test-Path $path) {
    $quoted = $path.Replace("'", "''")
    if ($path.StartsWith($SystemVst3, [StringComparison]::OrdinalIgnoreCase)) { Invoke-Elevated "Remove-Item -LiteralPath '$quoted' -Recurse -Force" }
    else { Remove-Item -LiteralPath $path -Recurse -Force }
  }
  Remove-Item $StateFile
  Say "Removed $path. Rescan plug-ins in Live."
  exit 0
}

# ---------------------------------------------------------------- 1. the machine
if ($BuildOnly) { $Yes = $true }
Step 'Checking the machine'
if ($env:OS -ne 'Windows_NT') { Fail 'this installer is for Windows' }

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
function Find-VS { if (Test-Path $vswhere) { & $vswhere -latest -products * -version '[17.0,18.0)' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath } }

$missing = @()
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { $missing += @{ name = 'Git'; id = 'Git.Git'; args = @() } }
if (-not (Get-Command cmake -ErrorAction SilentlyContinue)) { $missing += @{ name = 'CMake'; id = 'Kitware.CMake'; args = @() } }
if (-not (Find-VS)) {
  $missing += @{ name = 'Visual Studio 2022 Build Tools (C++)'; id = 'Microsoft.VisualStudio.2022.BuildTools'
                 args = @('--override', '--wait --quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended') }
}
foreach ($m in $missing) {
  Say "Missing: $($m.name)"
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { Fail "install $($m.name) and run this again (winget is not available)" }
  if ((Ask "Install $($m.name) with winget?" @('Yes', 'No, stop')) -ne 0) { Fail "$($m.name) is needed to build" }
  winget install --id $m.id -e --accept-package-agreements --accept-source-agreements @($m.args)
  if ($LASTEXITCODE -ne 0) { Fail "winget could not install $($m.name)" }
}
if ($missing.Count -gt 0) {
  # pick up PATH changes from the installs
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not (Get-Command cmake -ErrorAction SilentlyContinue) -or -not (Get-Command git -ErrorAction SilentlyContinue) -or -not (Find-VS)) {
    Fail 'tools were installed, but this window does not see them yet. Open a new window and run install.cmd again.'
  }
}
Say 'Git, CMake and Visual Studio 2022 C++ tools found.'

# The plugin window is a web page shown by Microsoft's WebView2 runtime. Windows
# 11 ships it, most Windows 10 machines have it through Edge.
$wv2Key = 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
$wv2 = @("HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}", "HKLM:\$wv2Key", "HKCU:\$wv2Key") |
  Where-Object { (Test-Path $_) -and (Get-ItemProperty $_ -ErrorAction SilentlyContinue).pv -notin @($null, '', '0.0.0.0') }
if (-not $wv2 -and -not $BuildOnly) {
  Say 'Missing: Microsoft Edge WebView2 Runtime (the plugin window needs it)'
  if ((Ask 'Install it with winget?' @('Yes', 'No, continue without (the window will stay empty)')) -eq 0) {
    winget install --id Microsoft.EdgeWebView2Runtime -e --accept-package-agreements --accept-source-agreements
  }
}

# ---------------------------------------------------------------- 2. questions

if (-not $PSBoundParameters.ContainsKey('Ref')) {
  $choice = Ask 'Which version to build?' @('The current checkout', 'The latest release tag', 'A tag or branch I name')
  $Ref = @('', 'latest', '')[$choice]
  if ($choice -eq 2) { $Ref = Read-Host 'Tag or branch' }
}
if ($Ref -eq 'latest') {
  Invoke-Quiet { git -C $Root fetch --tags --quiet }
  $Ref = git -C $Root tag --list 'v*' --sort=-v:refname | Select-Object -First 1
  if (-not $Ref) { Fail 'there is no release tag yet; build the current checkout instead' }
}

if ($Channel -eq '') {
  $Channel = @('Stable', 'Dev')[(Ask 'Install as?' @('Halden 6 (stable)', 'Halden 6 Dev: a separate plugin that sits next to the stable one'))]
}
$PluginName = if ($Channel -eq 'Dev') { 'Halden 6 Dev' } else { 'Halden 6' }

if (-not $BuildOnly -and -not $Target) {
  $choice = Ask 'Where to install?' @("VST3 system folder $SystemVst3 (needs admin, Live finds it by default)", 'A folder I name (no admin; set it as the VST3 custom folder in Live)')
  $Target = if ($choice -eq 0) { $SystemVst3 } else { Read-Host 'Folder' }
}

if (-not $Validate -and -not $Yes) { $Validate = (Ask 'Run pluginval after the build?' @('No', 'Yes')) -eq 1 }

# ---------------------------------------------------------------- 3. source
Step 'Getting the source'
$Src = $Root
if ($Ref) {
  # A separate worktree, so your own checkout and its changes stay untouched
  $Src = Join-Path $Root "build\src-$($Ref -replace '[^\w.-]', '_')"
  if (Test-Path $Src) { Invoke-Quiet { git -C $Root worktree remove --force $Src } }
  Invoke-Quiet { git -C $Root fetch --quiet origin $Ref }
  git -C $Root worktree add --detach $Src $Ref
  if ($LASTEXITCODE -ne 0) { Fail "cannot check out $Ref" }
}
git -C $Src submodule update --init --depth 1 plugin/JUCE
if ($LASTEXITCODE -ne 0) { Fail 'cannot fetch JUCE (git submodule)' }
$Commit = (git -C $Src rev-parse --short HEAD).Trim()
$Version = ((Select-String -Path (Join-Path $Src 'plugin\CMakeLists.txt') -Pattern 'project\(Halden6 VERSION ([\d.]+)').Matches[0].Groups[1].Value)
Say "Building $PluginName $Version ($Commit)"

# The WebView2 SDK (headers and the static loader library) for the build
$Wv2Version = '1.0.4314.35'
$Packages = Join-Path $Root 'build\packages'
$Wv2Dir = Join-Path $Packages "Microsoft.Web.WebView2.$Wv2Version"
if (-not (Test-Path (Join-Path $Wv2Dir 'build\native\include\WebView2.h'))) {
  Say "Downloading the WebView2 SDK $Wv2Version from nuget.org"
  New-Item -ItemType Directory -Force -Path $Packages | Out-Null
  $nupkg = Join-Path $Packages "Microsoft.Web.WebView2.$Wv2Version.zip"
  Invoke-WebRequest -UseBasicParsing -Uri "https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/$Wv2Version" -OutFile $nupkg
  Expand-Archive -Path $nupkg -DestinationPath $Wv2Dir -Force
  Remove-Item $nupkg
}

# ---------------------------------------------------------------- 4. build
Step 'Building (the first build takes a few minutes)'
$Build = Join-Path $Root "build\$Channel"
cmake -S (Join-Path $Src 'plugin') -B $Build -G 'Visual Studio 17 2022' -A x64 "-DHALDEN6_CHANNEL=$Channel" "-DJUCE_WEBVIEW2_PACKAGE_LOCATION=$Packages"
if ($LASTEXITCODE -ne 0) { Fail 'CMake could not configure the build' }
cmake --build $Build --config Release --target Halden6_VST3 --parallel
if ($LASTEXITCODE -ne 0) { Fail 'the build failed' }
$Built = Join-Path $Build "Halden6_artefacts\Release\VST3\$PluginName.vst3"
if (-not (Test-Path $Built)) { Fail "build finished, but $Built is missing" }
# The WebView2 loader is linked into the plugin; its licence asks for its notice to travel with it
$Wv2Licence = Get-ChildItem -Path $Wv2Dir -Filter 'LICENSE*' -File -ErrorAction SilentlyContinue | Select-Object -First 1
if ($Wv2Licence) {
  $res = Join-Path $Built 'Contents\Resources'
  New-Item -ItemType Directory -Force -Path $res | Out-Null
  Copy-Item $Wv2Licence.FullName (Join-Path $res 'WebView2-SDK-LICENSE.txt') -Force
  Say "Added the WebView2 SDK licence ($($Wv2Licence.Name)) to the plugin"
} else {
  Say 'Warning: no licence file found in the WebView2 SDK package; the plugin ships without its notice'
}
Say "Built $Built"

# ---------------------------------------------------------------- 5. validate
if ($Validate) {
  Step 'Validating with pluginval'
  $pv = Get-Command pluginval -ErrorAction SilentlyContinue
  if (-not $pv) { Say 'pluginval is not on PATH; skipped. Get it from https://github.com/Tracktion/pluginval/releases' }
  else {
    & $pv.Source --strictness-level 5 --validate-in-process --validate $Built
    if ($LASTEXITCODE -ne 0) { Fail 'pluginval found problems (see above)' }
  }
}

if ($BuildOnly) {
  $Zip = Join-Path $Root "build\Halden6-vst3-$Version.zip"
  if (Test-Path $Zip) { Remove-Item $Zip }
  Compress-Archive -Path $Built -DestinationPath $Zip
  Say "Wrote $Zip"
  exit 0
}

# ---------------------------------------------------------------- 6. install
Step 'Installing'
Wait-LiveClosed
$Dest = Join-Path $Target "$PluginName.vst3"
if (Test-Path $Dest) {
  if ((Ask "$Dest already exists. Replace it?" @('Replace', 'Cancel')) -ne 0) { Fail 'cancelled' }
}
Say "Copying to $Dest"
$s = $Built.Replace("'", "''"); $d = $Dest.Replace("'", "''"); $t = $Target.Replace("'", "''")
# Only ever replaces its own .vst3 folder
$copy = "New-Item -ItemType Directory -Force -Path '$t' | Out-Null; if (Test-Path -LiteralPath '$d') { Remove-Item -LiteralPath '$d' -Recurse -Force }; Copy-Item -LiteralPath '$s' -Destination '$d' -Recurse"
if ($Target.StartsWith($SystemVst3, [StringComparison]::OrdinalIgnoreCase)) { Invoke-Elevated $copy }
else { & ([scriptblock]::Create($copy)) }
if (-not (Test-Path $Dest)) { Fail "copy to $Dest failed" }

# ---------------------------------------------------------------- 7. record
New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
[ordered]@{ version = $Version; commit = $Commit; channel = $Channel; path = $Dest; date = (Get-Date).ToString('s') } |
  ConvertTo-Json | Set-Content -Path $StateFile -Encoding UTF8

# ---------------------------------------------------------------- 8. Live
Step 'Done. In Ableton Live:'
if ($Target.StartsWith($SystemVst3, [StringComparison]::OrdinalIgnoreCase)) {
  Say '  1. Settings > Plug-Ins: turn on "Use VST3 Plug-In System Folders".'
} else {
  Say "  1. Settings > Plug-Ins: turn on ""Use VST3 Plug-In Custom Folder"" and set it to $Target."
}
Say '  2. Click Rescan.'
Say "  3. Find $PluginName under Plug-Ins > Halden, and drop it on a MIDI track."
