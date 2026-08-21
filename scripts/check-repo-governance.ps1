[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$failures = New-Object System.Collections.Generic.List[string]
$checks = 0

function Add-Failure {
    param([string]$Message)
    $script:failures.Add($Message)
}

function Assert-File {
    param([string]$RelativePath)
    $script:checks++
    $path = Join-Path $script:repoRoot $RelativePath
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        Add-Failure "Missing required file: $RelativePath"
        return $false
    }
    return $true
}

function Read-RepoFile {
    param([string]$RelativePath)
    return [IO.File]::ReadAllText((Join-Path $script:repoRoot $RelativePath))
}

$requiredDiagramFiles = @(
    'docs/diagrams/README.md',
    'docs/diagrams/01-problem-tree.md',
    'docs/diagrams/02-decision-tree.md',
    'docs/diagrams/03-system-context.md',
    'docs/diagrams/04-container-runtime-view.md',
    'docs/diagrams/05-module-boundaries.md',
    'docs/diagrams/06-experiment-backtest-flow.md',
    'docs/diagrams/07-realtime-market-flow.md',
    'docs/diagrams/08-news-sentiment-flow.md',
    'docs/diagrams/09-reproducibility-provenance-map.md',
    'docs/diagrams/10-proof-coverage-map.md'
)

$requiredFiles = @(
    'README.md',
    'AGENTS.md',
    'CLAUDE.md',
    '.codex/config.toml',
    '.claude/settings.json',
    '.agents/skill-manifest.yaml',
    '.agents/skill-lock.yaml',
    '.agents/architecture-freeze.yaml',
    'docs/architecture/architecture-proposal.md',
    'docs/architecture/architecture-baseline.md',
    'docs/architecture/architecture-baseline-v1.md',
    'docs/adr/ADR-009-technology-realization.md',
    'docs/validation/architecture-proof-plan.md'
) + $requiredDiagramFiles

foreach ($requiredFile in $requiredFiles) {
    [void](Assert-File $requiredFile)
}

$obsoleteDirectories = @(
    ('ref' + 'erences'),
    ('tr' + 'ash')
)
foreach ($obsoleteDirectory in $obsoleteDirectories) {
    $checks++
    if (Test-Path -LiteralPath (Join-Path $repoRoot $obsoleteDirectory)) {
        Add-Failure "Obsolete process directory exists: $obsoleteDirectory"
    }
}

$obsoleteFilePatterns = @(
    ('BOOT' + 'STRAP*.md'),
    ('NEXT_' + 'PROMPT*.md'),
    ('HAND' + 'OFF*.md')
)
$artifactSearchRoots = @(Get-ChildItem -LiteralPath $repoRoot -Force | Where-Object { $_.Name -ne '.git' })
foreach ($obsoleteFilePattern in $obsoleteFilePatterns) {
    $checks++
    $obsoleteMatches = @(
        $artifactSearchRoots |
            ForEach-Object {
                if ($_.PSIsContainer) {
                    Get-ChildItem -LiteralPath $_.FullName -File -Recurse -Force -Filter $obsoleteFilePattern
                }
                elseif ($_.Name -like $obsoleteFilePattern) {
                    $_
                }
            }
    )
    if ($obsoleteMatches.Count -gt 0) {
        Add-Failure "Obsolete process artifact exists: $($obsoleteMatches[0].FullName)"
    }
}

if ($failures.Count -eq 0) {
    $readme = Read-RepoFile 'README.md'
    $agents = Read-RepoFile 'AGENTS.md'
    $claude = Read-RepoFile 'CLAUDE.md'
    $baseline = Read-RepoFile 'docs/architecture/architecture-baseline.md'
    $proposal = Read-RepoFile 'docs/architecture/architecture-proposal.md'
    $manifest = Read-RepoFile '.agents/skill-manifest.yaml'
    $lock = Read-RepoFile '.agents/skill-lock.yaml'
    $freeze = Read-RepoFile '.agents/architecture-freeze.yaml'
    $diagramReadme = Read-RepoFile 'docs/diagrams/README.md'
    $proofPlan = Read-RepoFile 'docs/validation/architecture-proof-plan.md'

    $checks++
    if ($agents -notmatch '(?m)^PROJECT MODE: IMPLEMENTATION AGAINST FROZEN ARCHITECTURE\s*$' -or
        $agents -notmatch '(?m)^ARCHITECTURE STATUS: FROZEN v1\.1\s*$' -or
        $agents -notmatch '(?m)^VALIDATION STATUS: PENDING IMPLEMENTATION PROOFS\s*$' -or
        $agents -notmatch '(?m)^IMPLEMENTATION STATUS: NOT STARTED\s*$') {
        Add-Failure 'AGENTS.md is not in implementation-against-frozen-architecture mode.'
    }

    $checks++
    if ($agents -notmatch '(?s)## Normative source hierarchy.*?docs/architecture/architecture-baseline\.md.*?docs/adr/.*?docs/requirements/') {
        Add-Failure 'AGENTS.md does not preserve the architecture source-of-truth hierarchy.'
    }

    $checks++
    if ($claude -notmatch '(?m)^@AGENTS\.md\s*$') {
        Add-Failure 'CLAUDE.md does not import the canonical AGENTS.md.'
    }

    $checks++
    if ($claude.Length -gt 4096 -or $claude -match '# Crypto Strategy Lab - Project Instructions') {
        Add-Failure 'CLAUDE.md appears to duplicate shared policy instead of containing a small platform delta.'
    }

    $checks += 5
    if ($readme -notmatch 'Architecture:\*\* `FROZEN v1\.1`' -or
        $readme -notmatch 'Validation:\*\* `PENDING IMPLEMENTATION PROOFS`' -or
        $readme -notmatch 'Implementation:\*\* `NOT STARTED`') {
        Add-Failure 'README.md does not state the current architecture, validation, and implementation status.'
    }
    if ($readme -notmatch 'Modular Monolith with selectively separated process roles') {
        Add-Failure 'README.md does not summarize the selected architecture style.'
    }
    if ($readme -notmatch 'docs/diagrams/README\.md' -or $readme -notmatch 'architecture-baseline\.md') {
        Add-Failure 'README.md does not link the diagram entry point and normative baseline.'
    }
    if ($readme -notmatch 'ADR-001' -or $readme -notmatch 'ADR-009') {
        Add-Failure 'README.md does not provide the required ADR index.'
    }
    if ($readme -notmatch 'Walking Skeleton' -or $readme -notmatch 'architecture proof-oriented vertical slice') {
        Add-Failure 'README.md does not identify the review-ready next phase.'
    }

    $checks += 2
    if ($diagramReadme -notmatch 'architecture-baseline\.md' -or $diagramReadme -notmatch 'architecture-proposal\.md') {
        Add-Failure 'Diagram README does not link back to the architecture source documents.'
    }
    if ($proofPlan -notmatch 'diagrams/10-proof-coverage-map\.md') {
        Add-Failure 'Architecture proof plan does not link to the proof coverage map.'
    }

    $checks++
    if ($baseline -notmatch '(?m)^\*\*Architecture Status:\*\* FROZEN\s*$') {
        Add-Failure 'Architecture baseline status is not FROZEN.'
    }

    $checks++
    $baselineVersionMatch = [regex]::Match($baseline, '(?m)^\*\*Baseline Version:\*\* (v[1-9][0-9]*(?:\.[0-9]+)*)\s*$')
    if (-not $baselineVersionMatch.Success) {
        Add-Failure 'Architecture baseline version is missing or invalid.'
    }

    $checks++
    $validationStatusMatch = [regex]::Match($baseline, '(?m)^\*\*Validation Status:\*\* (PENDING IMPLEMENTATION PROOFS|PARTIALLY VERIFIED|VERIFIED AGAINST BASELINE PROOFS)\s*$')
    if (-not $validationStatusMatch.Success) {
        Add-Failure 'Architecture baseline validation status is missing or invalid.'
    }

    $freezePathMatch = [regex]::Match($freeze, '(?m)^baseline:\s*(.+?)\s*$')
    $freezeVersionMatch = [regex]::Match($freeze, '(?m)^baselineVersion:\s*(v[1-9][0-9]*(?:\.[0-9]+)*)\s*$')
    $freezeStatusMatch = [regex]::Match($freeze, '(?m)^architectureStatus:\s*(FROZEN)\s*$')
    $freezeValidationMatch = [regex]::Match($freeze, '(?m)^validationStatus:\s*(PENDING IMPLEMENTATION PROOFS|PARTIALLY VERIFIED|VERIFIED AGAINST BASELINE PROOFS)\s*$')
    $freezeHashMatch = [regex]::Match($freeze, '(?m)^sha256:\s*([A-Fa-f0-9]{64})\s*$')
    $checks++
    if (-not $freezePathMatch.Success -or -not $freezeVersionMatch.Success -or -not $freezeStatusMatch.Success -or -not $freezeValidationMatch.Success -or -not $freezeHashMatch.Success) {
        Add-Failure 'Architecture freeze record is missing path, version, architecture status, validation status, or SHA-256.'
    }
    else {
        $checks += 2
        if (-not $baselineVersionMatch.Success -or $freezeVersionMatch.Groups[1].Value -ne $baselineVersionMatch.Groups[1].Value) {
            Add-Failure 'Architecture freeze version does not match the baseline.'
        }
        if (-not $validationStatusMatch.Success -or $freezeValidationMatch.Groups[1].Value -ne $validationStatusMatch.Groups[1].Value) {
            Add-Failure 'Architecture freeze validation status does not match the baseline.'
        }
        $frozenRelativePath = $freezePathMatch.Groups[1].Value.Trim()
        $frozenPath = Join-Path $repoRoot ($frozenRelativePath -replace '/', [IO.Path]::DirectorySeparatorChar)
        if (-not (Test-Path -LiteralPath $frozenPath -PathType Leaf)) {
            Add-Failure "Frozen baseline path does not resolve: $frozenRelativePath"
        }
        else {
            $actualFreezeHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $frozenPath).Hash
            if ($actualFreezeHash -ne $freezeHashMatch.Groups[1].Value.ToUpperInvariant()) {
                Add-Failure 'Frozen baseline content changed without updating the explicit freeze record/version.'
            }
        }
    }

    $checks += 5
    if ($baseline -notmatch 'Node\.js \+ TypeScript' -or $baseline -notmatch 'NestJS') {
        Add-Failure 'Baseline does not select the Node.js/TypeScript/NestJS core realization.'
    }
    if ($baseline -notmatch 'transactional outbox -> outbox dispatcher -> BullMQ durable queue -> idempotent consumer') {
        Add-Failure 'Baseline does not state the durable outbox-to-BullMQ consumer path.'
    }
    if ($baseline -notmatch 'Redis Pub/Sub acknowledgement is never evidence of durable delivery') {
        Add-Failure 'Baseline does not keep Redis Pub/Sub outside the durable delivery boundary.'
    }
    if ($baseline -notmatch 'either directly stored trade rows or an immutable trade-data reference plus cryptographic/content hash') {
        Add-Failure 'Baseline does not preserve the flexible content-addressed result-acceptance invariant.'
    }
    if ($baseline -notmatch 'Python is optional only behind that boundary') {
        Add-Failure 'Baseline does not constrain optional Python to the SentimentAnalyzer boundary.'
    }

    $adrDirectory = Join-Path $repoRoot 'docs\adr'
    $adrFiles = @(Get-ChildItem -LiteralPath $adrDirectory -Filter 'ADR-*.md' -File | Sort-Object Name)
    $checks++
    if ($adrFiles.Count -eq 0) {
        Add-Failure 'No ADR files were found.'
    }

    $baselineAdrLinks = [regex]::Matches($baseline, '\]\(\.\./adr/(ADR-[^)]+\.md)\)') |
        ForEach-Object { $_.Groups[1].Value } |
        Sort-Object -Unique

    foreach ($adrFile in $adrFiles) {
        $adrText = [IO.File]::ReadAllText($adrFile.FullName)
        $checks += 3
        if ($adrText -notmatch '(?m)^\*\*Status:\*\* ACCEPTED\s*$') {
            Add-Failure "ADR is not ACCEPTED: $($adrFile.Name)"
        }
        if ($adrText -notmatch 'architecture-baseline\.md') {
            Add-Failure "ADR does not reference the baseline: $($adrFile.Name)"
        }
        if ($baselineAdrLinks -notcontains $adrFile.Name) {
            Add-Failure "Baseline does not reference accepted ADR: $($adrFile.Name)"
        }
        $adrId = [IO.Path]::GetFileNameWithoutExtension($adrFile.Name).Substring(0, 7)
        if ($proposal -notmatch [regex]::Escape($adrId)) {
            Add-Failure "Proposal does not reference $adrId."
        }
    }

    foreach ($linkedAdr in $baselineAdrLinks) {
        $checks++
        if (-not (Test-Path -LiteralPath (Join-Path $adrDirectory $linkedAdr) -PathType Leaf)) {
            Add-Failure "Baseline ADR link does not resolve: $linkedAdr"
        }
    }

    $skillRoots = @('.agents/skills', '.claude/skills')
    $skillNames = New-Object System.Collections.Generic.HashSet[string]
    foreach ($skillRoot in $skillRoots) {
        $rootPath = Join-Path $repoRoot ($skillRoot -replace '/', [IO.Path]::DirectorySeparatorChar)
        if (-not (Test-Path -LiteralPath $rootPath -PathType Container)) {
            Add-Failure "Missing project skill directory: $skillRoot"
            continue
        }
        foreach ($skillDirectory in Get-ChildItem -LiteralPath $rootPath -Directory) {
            [void]$skillNames.Add($skillDirectory.Name)
            $skillFile = Join-Path $skillDirectory.FullName 'SKILL.md'
            if (-not (Test-Path -LiteralPath $skillFile -PathType Leaf)) {
                Add-Failure "Installed skill lacks SKILL.md: $skillRoot/$($skillDirectory.Name)"
            }
        }
    }

    foreach ($skillName in $skillNames) {
        $checks += 4
        $escapedName = [regex]::Escape($skillName)
        if ($manifest -notmatch "(?m)^\s+- name:\s*$escapedName\s*$") {
            Add-Failure "Installed skill is absent from manifest: $skillName"
        }
        if ($lock -notmatch "(?m)^\s+- name:\s*$escapedName\s*$") {
            Add-Failure "Installed skill is absent from lock: $skillName"
        }
        foreach ($skillRoot in $skillRoots) {
            $expectedSkillFile = Join-Path $repoRoot (($skillRoot + '/' + $skillName + '/SKILL.md') -replace '/', [IO.Path]::DirectorySeparatorChar)
            if (-not (Test-Path -LiteralPath $expectedSkillFile -PathType Leaf)) {
                Add-Failure "Skill is not represented for both agents: $skillRoot/$skillName/SKILL.md"
            }
        }
    }

    $lockedDestinations = [regex]::Matches(
        $lock,
        '(?m)^\s{6}(\.(?:agents|claude)/skills/[^:]+):\s*([A-Fa-f0-9]{64})\s*$'
    )
    $checks++
    if ($lockedDestinations.Count -eq 0) {
        Add-Failure 'Skill lock contains no destination content hashes.'
    }
    foreach ($lockedDestination in $lockedDestinations) {
        $checks++
        $relativePath = $lockedDestination.Groups[1].Value
        $expectedHash = $lockedDestination.Groups[2].Value.ToUpperInvariant()
        $path = Join-Path $repoRoot ($relativePath -replace '/', [IO.Path]::DirectorySeparatorChar)
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            Add-Failure "Locked skill file does not resolve: $relativePath"
            continue
        }
        $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash
        if ($actualHash -ne $expectedHash) {
            Add-Failure "Locked skill content changed: $relativePath"
        }
    }

    $markdownFiles = @(
        (Join-Path $repoRoot 'README.md'),
        (Join-Path $repoRoot 'AGENTS.md'),
        (Join-Path $repoRoot 'CLAUDE.md')
    ) + @(Get-ChildItem -LiteralPath (Join-Path $repoRoot 'docs') -Filter '*.md' -File -Recurse | ForEach-Object { $_.FullName })

    foreach ($markdownFile in $markdownFiles) {
        $text = [IO.File]::ReadAllText($markdownFile)
        foreach ($linkMatch in [regex]::Matches($text, '\]\((?!https?://|mailto:|#)([^)#]+)(?:#[^)]*)?\)')) {
            $checks++
            $link = [Uri]::UnescapeDataString($linkMatch.Groups[1].Value)
            $target = [IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $markdownFile) ($link -replace '/', [IO.Path]::DirectorySeparatorChar)))
            if (-not (Test-Path -LiteralPath $target)) {
                Add-Failure "Broken Markdown reference in $([IO.Path]::GetFileName($markdownFile)): $link"
            }
        }
    }

    $processTerms = @(
        ('BOOT' + 'STRAP(?:-init)?\.md'),
        ('NEXT_' + 'PROMPT[^\\/\r\n]*'),
        ('HAND' + 'OFF(?:-[0-9]+)?\.md'),
        ('ref' + 'erences[\\/]'),
        ('tr' + 'ash[\\/]'),
        ('boot' + 'strap' + ' phase'),
        ('architecture boot' + 'strap' + ' prompt')
    )
    $processReferencePattern = '(?i)(' + ($processTerms -join '|') + ')'
    $textExtensions = @('.md', '.yaml', '.yml', '.json', '.toml', '.ps1')
    $operationalTextFiles = @(
        $artifactSearchRoots |
            ForEach-Object {
                if ($_.PSIsContainer) {
                    Get-ChildItem -LiteralPath $_.FullName -File -Recurse -Force |
                        Where-Object { $textExtensions -contains $_.Extension }
                }
                elseif ($textExtensions -contains $_.Extension) {
                    $_
                }
            }
    )
    foreach ($operationalTextFile in $operationalTextFiles) {
        $checks++
        $operationalText = [IO.File]::ReadAllText($operationalTextFile.FullName)
        if ($operationalText -match $processReferencePattern) {
            Add-Failure "Obsolete process reference in $($operationalTextFile.FullName): $($Matches[0])"
        }
    }
}

if ($failures.Count -gt 0) {
    Write-Host "Repository governance FAILED ($($failures.Count) issue(s), $checks checks)." -ForegroundColor Red
    foreach ($failure in $failures) {
        Write-Host " - $failure" -ForegroundColor Red
    }
    exit 1
}

Write-Host "Repository governance PASSED ($checks checks)." -ForegroundColor Green
$validatedVersion = if ($baselineVersionMatch.Success) { $baselineVersionMatch.Groups[1].Value } else { 'UNKNOWN' }
$validatedStatus = if ($validationStatusMatch.Success) { $validationStatusMatch.Groups[1].Value } else { 'UNKNOWN' }
Write-Host "Baseline: FROZEN $validatedVersion; validation: $validatedStatus; ADRs, diagrams, links, skills, locks, and freeze hash are consistent."
exit 0
