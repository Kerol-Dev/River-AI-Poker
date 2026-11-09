# River screen text recognition for Windows 10/11 using the built-in Windows.Media.Ocr engine.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File recognize.ps1 <manifest.json>
# The manifest is a JSON array of PNG paths. Output is a JSON array, one entry per image:
#   { "lines": [ { "text": "...", "x": 0, "y": 0, "width": 0, "height": 0 } ] }  (pixels)
# Nothing leaves the computer; the images are local temporary files written by River.
param([Parameter(Mandatory = $true)][string]$Manifest)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]
function Await($operation, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation))
  $task.Wait(-1) | Out-Null
  $task.Result
}
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime] | Out-Null
[Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime] | Out-Null

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if ($null -eq $engine) {
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('en-US'))
}
if ($null -eq $engine) {
  [Console]::Error.WriteLine('Windows text recognition is unavailable. Add an OCR language in Settings > Time & language > Language.')
  exit 2
}
$paths = Get-Content -Raw -LiteralPath $Manifest | ConvertFrom-Json
$results = @()
foreach ($path in $paths) {
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($path)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  try {
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $ocr = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    $lines = @()
    foreach ($line in $ocr.Lines) {
      $x0 = [double]::MaxValue; $y0 = [double]::MaxValue; $x1 = 0; $y1 = 0
      foreach ($word in $line.Words) {
        $r = $word.BoundingRect
        $x0 = [Math]::Min($x0, $r.X); $y0 = [Math]::Min($y0, $r.Y)
        $x1 = [Math]::Max($x1, $r.X + $r.Width); $y1 = [Math]::Max($y1, $r.Y + $r.Height)
      }
      $lines += [pscustomobject]@{ text = $line.Text; x = $x0; y = $y0; width = $x1 - $x0; height = $y1 - $y0 }
    }
    $results += [pscustomobject]@{ lines = $lines }
  } finally {
    $stream.Dispose()
  }
}
ConvertTo-Json -InputObject @($results) -Depth 5 -Compress
