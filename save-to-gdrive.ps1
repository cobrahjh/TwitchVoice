$j = Get-Content "C:\Users\hjhar\TwitchVoice\screenshot.json" | ConvertFrom-Json
$b64 = $j.data.screenshot -replace 'data:image/png;base64,',''
$timestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$outPath = "G:\My Drive\AI Development\Screenshots\twitchvoice_$timestamp.png"
[IO.File]::WriteAllBytes($outPath, [Convert]::FromBase64String($b64))
Write-Host "Saved to $outPath"
