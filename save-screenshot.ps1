$j = Get-Content screenshot.json | ConvertFrom-Json
$b64 = $j.data.screenshot -replace 'data:image/png;base64,',''
[IO.File]::WriteAllBytes("$PSScriptRoot\screenshot.png", [Convert]::FromBase64String($b64))
Write-Host "Saved screenshot.png"
