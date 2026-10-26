# Rebuilds a flipbook edition's pages from the catalog artwork.
# Run after adding, removing or replacing page images:
#   powershell -ExecutionPolicy Bypass -File build-pages.ps1
#   powershell -ExecutionPolicy Bypass -File build-pages.ps1 -Source ..\christmas-menu -Out christmas\pages
#
# Reads catalog-manifest.json (page order + titles) from -Source and writes to -Out:
#   NN.jpg               web-sized copies of each page
#   pages.js             page list used by the edition's index.html
#   pages-embedded.js    the same pages inlined, so index.html also works
#                        when opened straight from disk (file://)
param(
  [string]$Source = (Join-Path $PSScriptRoot '..\Updated mori & mill menu'),
  [string]$Out = 'pages',
  [int]$Quality = 88
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

if (-not [IO.Path]::IsPathRooted($Source)) { $Source = Join-Path $PSScriptRoot $Source }
$out = if ([IO.Path]::IsPathRooted($Out)) { $Out } else { Join-Path $PSScriptRoot $Out }
New-Item -ItemType Directory -Force $out | Out-Null
Get-ChildItem $out -Filter '*.jpg' | Remove-Item

$manifest = Get-Content (Join-Path $Source 'catalog-manifest.json') -Raw | ConvertFrom-Json
$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, [long]$Quality)

$list = @()
$data = @()
foreach ($p in ($manifest.pages | Sort-Object page)) {
  $name = '{0:D2}.jpg' -f [int]$p.page
  $dest = Join-Path $out $name

  # Flatten onto an opaque bitmap so any transparency becomes paper colour, not black.
  $img = [System.Drawing.Image]::FromFile((Join-Path $Source $p.image))
  $bmp = New-Object System.Drawing.Bitmap $img.Width, $img.Height, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::FromArgb(246, 241, 231))
  $g.DrawImage($img, 0, 0, $img.Width, $img.Height)
  $g.Dispose(); $img.Dispose()
  $bmp.Save($dest, $jpeg, $params)
  $bmp.Dispose()

  $list += [pscustomobject]@{ title = $p.title; src = "pages/$name" }
  $data += 'data:image/jpeg;base64,' + [Convert]::ToBase64String([IO.File]::ReadAllBytes($dest))
  Write-Host ("{0}  {1}  {2:N0} KB" -f $name, $p.title, ((Get-Item $dest).Length / 1KB))
}

$utf8 = New-Object System.Text.UTF8Encoding $false
[IO.File]::WriteAllText((Join-Path $out 'pages.js'),
  "window.FLIPBOOK_PAGES = " + (ConvertTo-Json -InputObject $list -Compress) + ";`n", $utf8)
[IO.File]::WriteAllText((Join-Path $out 'pages-embedded.js'),
  "window.FLIPBOOK_PAGE_DATA = " + (ConvertTo-Json -InputObject $data -Compress) + ";`n", $utf8)

Write-Host "Wrote $($list.Count) pages to $out"
