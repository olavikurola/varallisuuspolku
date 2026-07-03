# julkaise.ps1 — julkaisee Varallisuuspolun GitHub Pagesiin.
# Esivaatimus: gh auth login (kertaalleen). Aja repon juuresta: .\julkaise.ps1
$ErrorActionPreference = 'Continue'
$repo = 'varallisuuspolku'
Set-Location $PSScriptRoot

# Etsi gh myos silloin, kun PATH ei ole viela paivittynyt asennuksen jalkeen
$gh = (Get-Command gh -ErrorAction SilentlyContinue).Source
if (-not $gh) { $gh = Join-Path $env:ProgramFiles 'GitHub CLI\gh.exe' }
if (-not (Test-Path $gh)) {
  Write-Host "GitHub CLI (gh) ei loydy. Asenna:  winget install GitHub.cli" -ForegroundColor Yellow
  exit 1
}

& $gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Et ole kirjautunut GitHubiin. Aja ensin:  & '$gh' auth login" -ForegroundColor Yellow
  exit 1
}
$user = & $gh api user --jq .login
Write-Host "GitHub-kayttaja: $user"

# Absoluuttiset URL:t OG-kuvaan ja palautelinkkiin
$base = "https://$user.github.io/$repo/"
$idxPath = Join-Path $PSScriptRoot 'index.html'
$idx = [IO.File]::ReadAllText($idxPath)
$idx = $idx -replace 'property="og:image" content="[^"]*"', ('property="og:image" content="' + $base + 'og.png"')
$idx = $idx -replace 'id="repoLink" href="[^"]*"', ('id="repoLink" href="https://github.com/' + $user + '/' + $repo + '"')
[IO.File]::WriteAllText($idxPath, $idx, (New-Object System.Text.UTF8Encoding($false)))

git add -A
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { git commit -m "Julkaisu: absoluuttiset OG- ja palautelinkit" }

# Luo repo tai pushaa olemassa olevaan
& $gh api "repos/$user/$repo" --silent 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Luodaan julkinen repo $user/$repo ja pushataan..."
  & $gh repo create $repo --public --source . --push --description "Visuaalinen varallisuussuunnittelutyokalu - kaikki data pysyy selaimessa"
} else {
  Write-Host "Repo on jo olemassa - pushataan..."
  git push -u origin main
}

# GitHub Pages paalle (main-haaran juuresta); 409 = jo kytketty
& $gh api "repos/$user/$repo/pages" -X POST -f "source[branch]=main" -f "source[path]=/" --silent 2>$null

Write-Host "Odotetaan Pages-buildia (voi kestaa pari minuuttia)..."
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 10
  $status = & $gh api "repos/$user/$repo/pages" --jq .status 2>$null
  Write-Host "." -NoNewline
  if ($status -eq 'built') { break }
}
Write-Host ""
Write-Host "Valmis! Sivusto: $base" -ForegroundColor Green
Write-Host "Jaa tama linkki kavereille."
