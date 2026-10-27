$ErrorActionPreference = 'Stop'
$release = Split-Path -Parent $PSScriptRoot
$workspace = Split-Path -Parent (Split-Path -Parent $release)
$zipPath = Join-Path $workspace 'web-publicar\recruitment-studio-web.zip'
$manifest = @(Get-Content -Raw -LiteralPath (Join-Path $release 'pacote-manifesto.json') | ConvertFrom-Json)
& 'C:\Program Files\7-Zip\7z.exe' t $zipPath | Out-File -LiteralPath (Join-Path $release 'pacote-7zip.log') -Encoding utf8
if ($LASTEXITCODE -ne 0) { throw 'Falha no teste de integridade do ZIP' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    $entries = @{}
    foreach ($entry in $zip.Entries) { if ($entry.Name) { $entries[$entry.FullName.Replace('\', '/')] = $entry } }
    if ($entries.Count -ne $manifest.Count) { throw 'O ZIP e a pasta tem quantidades de ficheiros diferentes' }
    foreach ($file in $manifest) {
        $entry = $entries[$file.path]
        if (!$entry -or $entry.Length -ne $file.bytes) { throw "Ficheiro ausente ou tamanho diferente: $($file.path)" }
        $stream = $entry.Open()
        $sha = [Security.Cryptography.SHA256]::Create()
        try { $hash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
        finally { $stream.Dispose(); $sha.Dispose() }
        if ($hash -ne $file.sha256) { throw "Conteudo diferente: $($file.path)" }
    }
}
finally { $zip.Dispose() }
$result = [pscustomobject]@{ checkedAt=[DateTimeOffset]::UtcNow.ToString('o'); zip=$zipPath; files=$manifest.Count; bytes=(Get-Item -LiteralPath $zipPath).Length; everyFileMatchesFolder=$true; sha256=(Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant() }
$result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $release 'verificacao-zip.json') -Encoding utf8
$result | ConvertTo-Json
