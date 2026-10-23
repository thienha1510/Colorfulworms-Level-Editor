param([string]$Root = $PSScriptRoot, [int]$Port = 8793, [switch]$Open)
# Copyright (c) 2026 Colorful Worms development team. Proprietary and confidential; shared with testers for playtesting only.
# Minimal static file server for the Colorful Worms editor + web build (Cocos needs http://, not file://).
# Tries ports $Port..$Port+6 so a busy port does not stop the tool.
$ErrorActionPreference = 'Stop'
$rootFull = (Resolve-Path $Root).Path.TrimEnd('\')
$types = @{ '.html'='text/html; charset=utf-8'; '.js'='application/javascript; charset=utf-8'; '.mjs'='application/javascript; charset=utf-8';
  '.json'='application/json; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg';
  '.webp'='image/webp'; '.svg'='image/svg+xml'; '.wasm'='application/wasm'; '.mp3'='audio/mpeg'; '.ogg'='audio/ogg'; '.wav'='audio/wav';
  '.txt'='text/plain; charset=utf-8'; '.bin'='application/octet-stream'; '.cconb'='application/octet-stream'; '.ttf'='font/ttf'; '.atlas'='text/plain; charset=utf-8' }
$l = $null
foreach ($p in $Port..($Port + 6)) {
  try { $t = New-Object System.Net.HttpListener; $t.Prefixes.Add("http://localhost:$p/"); $t.Start(); $l = $t; $Port = $p; break } catch { }
}
if (-not $l) { Write-Host "Khong mo duoc cong $Port-$($Port+6). Hay dong chuong trinh dang dung cac cong nay roi chay lai."; exit 1 }
Write-Host ""
Write-Host "  Colorful Worms Level Editor dang chay: http://localhost:$Port/"
Write-Host "  Giu cua so nay mo trong luc dung tool. Dong cua so de tat."
Write-Host ""
if ($Open) { Start-Process "http://localhost:$Port/index.html" }
while ($l.IsListening) {
  $c = $l.GetContext()
  try {
    $rel = [Uri]::UnescapeDataString($c.Request.Url.AbsolutePath).TrimStart('/')
    if ($rel -eq '') { $rel = 'index.html' }
    $full = [IO.Path]::GetFullPath((Join-Path $rootFull ($rel -replace '/', '\')))
    if (-not $full.StartsWith($rootFull)) { throw 'forbidden' }
    if (Test-Path $full -PathType Container) { $full = Join-Path $full 'index.html' }
    if (Test-Path $full -PathType Leaf) {
      $ext = [IO.Path]::GetExtension($full).ToLower()
      $c.Response.ContentType = $(if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' })
      $c.Response.Headers.Add('Cache-Control', 'no-store')
      if ($c.Request.HttpMethod -ne 'HEAD') { $bytes = [IO.File]::ReadAllBytes($full); $c.Response.OutputStream.Write($bytes, 0, $bytes.Length) }
    } else { $c.Response.StatusCode = 404 }
  } catch { $c.Response.StatusCode = 500 }
  $c.Response.Close()
}
