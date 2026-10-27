$ErrorActionPreference = 'Stop'
$project = 'C:\Users\guilherme.andrade\Desktop\Dev\RS-codex\recruitment-studio-web'
$workspace = Split-Path -Parent $project
$release = Split-Path -Parent $PSScriptRoot
$sevenZip = 'C:\Program Files\7-Zip\7z.exe'
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-Manifest([string]$root) {
    $resolved = (Resolve-Path -LiteralPath $root).Path
    $items = @(Get-ChildItem -LiteralPath $resolved -Recurse -File -Force | Sort-Object FullName)
    foreach ($item in $items) {
        [pscustomobject]@{
            path = $item.FullName.Substring($resolved.Length + 1).Replace('\', '/')
            bytes = $item.Length
            sha256 = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        }
    }
}

function Save-VerifiedSnapshot([string]$root, [string]$name) {
    $zipPath = Join-Path $release ($name + '.zip')
    $manifestPath = Join-Path $release ($name + '-manifesto.json')
    if ((Test-Path -LiteralPath $zipPath) -or (Test-Path -LiteralPath $manifestPath)) {
        throw "A copia ja existe; nao sera substituida: $name"
    }
    $links = @(Get-ChildItem -LiteralPath $root -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint })
    if ($links.Count) { throw 'A copia contem ligacoes de sistema de ficheiros; requer inspecao.' }
    $manifest = @(Get-Manifest $root)
    $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding utf8
    Push-Location -LiteralPath $root
    try { & $sevenZip a -tzip -mx=5 $zipPath '.' | Out-File -LiteralPath (Join-Path $release ($name + '-7zip.log')) -Encoding utf8; if ($LASTEXITCODE -ne 0) { throw 'Falha na criacao do ZIP.' } }
    finally { Pop-Location }
    & $sevenZip t $zipPath | Add-Content -LiteralPath (Join-Path $release ($name + '-7zip.log')) -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw 'Falha na integridade do ZIP.' }
    $zip = [IO.Compression.ZipFile]::OpenRead($zipPath)
    try {
        $entries = @{}
        foreach ($entry in $zip.Entries) { if ($entry.Name) { $entries[$entry.FullName.Replace('\', '/')] = $entry } }
        if ($entries.Count -ne $manifest.Count) { throw 'Numero de ficheiros diferente no ZIP.' }
        foreach ($file in $manifest) {
            $entry = $entries[$file.path]
            if (!$entry -or $entry.Length -ne $file.bytes) { throw "Ficheiro ausente ou tamanho diferente: $($file.path)" }
            $stream = $entry.Open()
            $sha = [Security.Cryptography.SHA256]::Create()
            try { $hash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
            finally { $stream.Dispose(); $sha.Dispose() }
            if ($hash -ne $file.sha256) { throw "Conteudo diferente no ZIP: $($file.path)" }
        }
    }
    finally { $zip.Dispose() }
    [pscustomobject]@{ root=$root; zip=$zipPath; files=$manifest.Count; bytes=($manifest | Measure-Object bytes -Sum).Sum; zipSha256=(Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant(); verifiedEveryFile=$true }
}

$source = Save-VerifiedSnapshot $project 'aplicacao-validada-v25'
$output = [IO.Path]::GetFullPath((Join-Path $workspace 'web-publicar'))
$previous = if (Test-Path -LiteralPath $output) { Save-VerifiedSnapshot $output 'web-publicar-anterior' } else { $null }
[pscustomobject]@{
    createdAt = [DateTimeOffset]::UtcNow.ToString('o')
    localDate = '2026-10-26'
    timezone = 'Europe/Lisbon'
    source = $source
    previousOutput = $previous
    previousOutputExisted = ($null -ne $previous)
    browserDataIncluded = $false
    note = 'Copia integral dos ficheiros do projeto; nao e uma copia dos dados guardados no navegador. A instalacao habitual ainda nao foi identificada.'
} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $release 'PRESERVACAO.json') -Encoding utf8
Get-Content -LiteralPath (Join-Path $release 'PRESERVACAO.json')
