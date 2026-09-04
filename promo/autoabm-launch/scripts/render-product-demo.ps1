param(
  [string]$OutputPath = "..\\..\\docs\\public\\launch\\v2\\autoabm-product-demo.mp4"
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$ffmpegPath = Join-Path $projectRoot 'node_modules\\@remotion\\compositor-win32-x64-msvc\\ffmpeg.exe'
$sourcePath = Join-Path $projectRoot 'public\\footage\\autoabm-product-body.mp4'
$introAudioPath = Join-Path $projectRoot 'public\\footage\\product-demo-intro-voice.aac'
$introPath = Join-Path $projectRoot 'out\\product-demo-intro.mp4'
$closingPath = Join-Path $projectRoot 'out\\product-demo-closing.mp4'
$resolvedOutputPath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $OutputPath))

if (-not (Test-Path -LiteralPath $sourcePath)) {
  throw "Missing product-demo footage: $sourcePath"
}

if (-not (Test-Path -LiteralPath $introAudioPath)) {
  throw "Missing product-demo introductory narration: $introAudioPath"
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $closingPath) | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $resolvedOutputPath) | Out-Null

Push-Location $projectRoot
try {
  bunx remotion render src/index.ts ProductDemoIntro $introPath --codec=h264 --crf=18
  bunx remotion render src/index.ts ProductDemoClosing $closingPath --codec=h264 --crf=18
}
finally {
  Pop-Location
}

& $ffmpegPath -y `
  -i $introPath `
  -i $sourcePath `
  -i $closingPath `
  -i $introAudioPath `
  -f lavfi `
  -i 'sine=frequency=0:sample_rate=48000:duration=6' `
  -filter_complex '[0:v][1:v][2:v]concat=n=3:v=1:a=0[v];[3:a]atrim=duration=9.7,aformat=channel_layouts=stereo[introAudio];[4:a]aformat=channel_layouts=stereo[closingAudio];[introAudio][1:a][closingAudio]concat=n=3:v=0:a=1[a]' `
  -map '[v]' `
  -map '[a]' `
  -c:v libx264 `
  -crf 21 `
  -preset medium `
  -pix_fmt yuv420p `
  -c:a aac `
  -b:a 128k `
  -movflags +faststart `
  -shortest `
  $resolvedOutputPath

if ($LASTEXITCODE -ne 0) {
  throw "Failed to render product demo: exit code $LASTEXITCODE"
}
