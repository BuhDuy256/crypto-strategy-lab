[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$failures = New-Object System.Collections.Generic.List[string]
$checks = 0

# A missing required file is the only kind of failure that has to stop the deep
# checks, because those read those files. Every other finding is reported alongside
# them, so one unrelated problem never hides the rest of the rule set.
$missingRequiredFiles = 0

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
        $script:missingRequiredFiles++
        return $false
    }
    return $true
}

function Read-RepoFile {
    param([string]$RelativePath)
    return [IO.File]::ReadAllText((Join-Path $script:repoRoot $RelativePath))
}

function Get-NormalizedFileSha256 {
    # Freeze identity is repository-content identity, not checkout line-ending
    # identity. Normalize CRLF/CR to LF so Windows and Linux validate the same tree.
    param([string]$Path)
    $normalizedContent = [IO.File]::ReadAllText($Path).Replace("`r`n", "`n").Replace("`r", "`n")
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
        $payloadBytes = [Text.UTF8Encoding]::new($false).GetBytes($normalizedContent)
        return ([BitConverter]::ToString($sha256.ComputeHash($payloadBytes))).Replace('-', '').ToUpperInvariant()
    }
    finally {
        $sha256.Dispose()
    }
}

function Get-SkillTreeHash {
    # Content identity of one skill directory: every file's SHA-256 over
    # LF-normalized UTF-8, keyed by sorted relative path. Normalizing means a
    # Windows checkout and a Linux checkout of the same content agree, so the
    # same hash pins the canonical copy and both mirrors.
    param([string]$Path)
    $lines = @(
        Get-ChildItem -LiteralPath $Path -Recurse -File |
            Sort-Object { $_.FullName.Substring($Path.Length + 1).Replace('\', '/') } |
            ForEach-Object {
                $relativeFile = $_.FullName.Substring($Path.Length + 1).Replace('\', '/')
                $normalizedContent = [IO.File]::ReadAllText($_.FullName).Replace("`r`n", "`n").Replace("`r", "`n")
                $fileSha256 = [Security.Cryptography.SHA256]::Create()
                try {
                    $normalizedBytes = [Text.UTF8Encoding]::new($false).GetBytes($normalizedContent)
                    $fileHash = ([BitConverter]::ToString($fileSha256.ComputeHash($normalizedBytes))).Replace('-', '').ToLowerInvariant()
                }
                finally {
                    $fileSha256.Dispose()
                }
                "$relativeFile`t$fileHash"
            }
    )
    if ($lines.Count -eq 0) {
        return $null
    }
    $treePayload = [string]::Join("`n", $lines) + "`n"
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
        $payloadBytes = [Text.UTF8Encoding]::new($false).GetBytes($treePayload)
        return ([BitConverter]::ToString($sha256.ComputeHash($payloadBytes))).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $sha256.Dispose()
    }
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
    'CODING_STANDARDS.md',
    'docker-compose.yml',
    'implementation-plan/README.md',
    'implementation-plan/VERSIONS.md',
    'implementation-plan/TRACKING.md',
    'implementation-plan/JOURNAL.md',
    '.scratch/checkpoints/TEMPLATE.md',
    '.codex/config.toml',
    '.claude/settings.json',
    '.agents/skill-manifest.yaml',
    '.agents/skill-lock.yaml',
    '.agents/architecture-freeze.yaml',
    'skills-lock.json',
    'docs/agents/issue-tracker.md',
    'docs/agents/domain.md',
    'docs/agents/development-workflow.md',
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
# Scan the repository's own files only. Installed dependencies and build output are
# not project artifacts, and their contents produce false obsolete-process matches.
$excludedScanRoots = @('.git', 'node_modules', 'dist', 'coverage', '.pnpm-store')
$artifactSearchRoots = @(
    Get-ChildItem -LiteralPath $repoRoot -Force |
        Where-Object { $excludedScanRoots -notcontains $_.Name }
)
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

if ($missingRequiredFiles -eq 0) {
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
    $agentsArchitectureVersionMatch = [regex]::Match($agents, '(?m)^ARCHITECTURE STATUS: FROZEN (v[1-9][0-9]*(?:\.[0-9]+)*)\s*$')
    if ($agents -notmatch '(?m)^PROJECT MODE: IMPLEMENTATION AGAINST FROZEN ARCHITECTURE\s*$' -or
        -not $agentsArchitectureVersionMatch.Success -or
        $agents -notmatch '(?m)^VALIDATION STATUS: PENDING IMPLEMENTATION PROOFS\s*$') {
        Add-Failure 'AGENTS.md is not in implementation-against-frozen-architecture mode.'
    }

    # Implementation status and current product version are separate facts, so the
    # target version can advance without changing status vocabulary. Both are set by
    # the user; the validator only checks that each states one allowed value.
    $checks++
    $agentsImplementationStatus = [regex]::Match($agents, '(?m)^IMPLEMENTATION STATUS: (NOT STARTED|IN PROGRESS|COMPLETE)\s*$')
    if (-not $agentsImplementationStatus.Success) {
        Add-Failure 'AGENTS.md does not state a valid IMPLEMENTATION STATUS (NOT STARTED, IN PROGRESS, or COMPLETE).'
    }

    $checks++
    $agentsProductVersion = [regex]::Match($agents, '(?m)^CURRENT PRODUCT VERSION: (NONE|V[1-9][0-9]*)\s*$')
    if (-not $agentsProductVersion.Success) {
        Add-Failure 'AGENTS.md does not state a CURRENT PRODUCT VERSION (NONE or V<n>).'
    }
    elseif ($agentsImplementationStatus.Success) {
        $checks++
        $statusValue = $agentsImplementationStatus.Groups[1].Value
        $versionValue = $agentsProductVersion.Groups[1].Value
        if ($statusValue -eq 'NOT STARTED' -and $versionValue -ne 'NONE') {
            Add-Failure "AGENTS.md says implementation has not started but names product version $versionValue."
        }
        if ($statusValue -ne 'NOT STARTED' -and $versionValue -eq 'NONE') {
            Add-Failure "AGENTS.md says implementation status $statusValue but names no current product version."
        }
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
    if ($agents -notmatch '(?m)^- `improve-codebase-architecture` is MANUAL-ONLY' -or
        $agents -notmatch 'must not redesign the frozen architecture') {
        Add-Failure 'AGENTS.md does not preserve the manual-only frozen-architecture guardrail.'
    }
    if ($agents -notmatch '(?m)^- `domain-modeling`.*existing `docs/adr/ADR-NNN-\*` convention' -or
        $agents -notmatch 'must not rewrite accepted ADRs') {
        Add-Failure 'AGENTS.md does not constrain domain-modeling to existing ADR governance.'
    }
    if ($agents -notmatch '(?m)^- `implement` runs only for an explicit implementation request' -or
        $agents -notmatch 'must not commit or push unless the user explicitly requests') {
        Add-Failure 'AGENTS.md does not constrain implementation and Git side effects.'
    }
    if ($agents -notmatch 'docs/agents/issue-tracker\.md' -or $agents -notmatch 'docs/agents/domain\.md') {
        Add-Failure 'AGENTS.md does not point to the configured issue-tracker and domain guidance.'
    }
    if ($agents -notmatch 'docs/agents/development-workflow\.md') {
        Add-Failure 'AGENTS.md does not point to the project development workflow.'
    }

    $checks += 6
    $readmeArchitectureVersionMatch = [regex]::Match($readme, 'Architecture:\*\* `FROZEN (v[1-9][0-9]*(?:\.[0-9]+)*)`')
    if (-not $readmeArchitectureVersionMatch.Success -or
        -not $agentsArchitectureVersionMatch.Success -or
        $readmeArchitectureVersionMatch.Groups[1].Value -ne $agentsArchitectureVersionMatch.Groups[1].Value -or
        $readme -notmatch 'Validation:\*\* `PENDING IMPLEMENTATION PROOFS`' -or
        $readme -notmatch 'Implementation:\*\* `(?:NOT STARTED|IN PROGRESS|COMPLETE)`' -or
        $readme -notmatch 'Current product version:\*\* `(?:NONE|V[1-9][0-9]*)`') {
        Add-Failure 'README.md does not state the current architecture, validation, implementation status, and product version.'
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
    if ($readme -notmatch 'docs/agents/development-workflow\.md') {
        Add-Failure 'README.md does not link the project development workflow.'
    }

    $checks += 2
    if ($agentsImplementationStatus.Success -and
        $readme -notmatch ('Implementation:\*\* `' + [regex]::Escape($agentsImplementationStatus.Groups[1].Value) + '`')) {
        Add-Failure 'README.md implementation status does not match AGENTS.md.'
    }
    if ($agentsProductVersion.Success -and
        $readme -notmatch ('Current product version:\*\* `' + [regex]::Escape($agentsProductVersion.Groups[1].Value) + '`')) {
        Add-Failure 'README.md current product version does not match AGENTS.md.'
    }

    # A fresh session must be able to reach the implementation plan from the entry
    # points alone, and must find the same work-unit rule wherever it is stated.
    $planReadme = Read-RepoFile 'implementation-plan/README.md'
    $tracking = Read-RepoFile 'implementation-plan/TRACKING.md'
    $journal = Read-RepoFile 'implementation-plan/JOURNAL.md'
    $workflow = Read-RepoFile 'docs/agents/development-workflow.md'
    $standards = Read-RepoFile 'CODING_STANDARDS.md'

    $checks += 3
    if ($agents -notmatch 'implementation-plan/README\.md') {
        Add-Failure 'AGENTS.md does not point to the implementation plan entry point.'
    }
    if ($agents -notmatch 'implementation-plan/TRACKING\.md') {
        Add-Failure 'AGENTS.md does not point to the implementation tracker.'
    }
    if ($readme -notmatch 'implementation-plan/README\.md' -or $readme -notmatch 'implementation-plan/TRACKING\.md') {
        Add-Failure 'README.md does not point to the implementation plan and tracker.'
    }

    $checks += 3
    if ($agents -notmatch 'the plan slice is the work unit' -or $agents -notmatch 'Do not run `to-tickets` over a slice') {
        Add-Failure 'AGENTS.md does not state the plan-slice work-unit rule.'
    }
    if ($workflow -notmatch 'the plan slice is the work unit' -or $workflow -notmatch 'Do not run `to-tickets` over a slice') {
        Add-Failure 'Development workflow does not state the plan-slice work-unit rule.'
    }
    if ($planReadme -notmatch 'Do not run `to-tickets` over a\s+slice') {
        Add-Failure 'Implementation plan does not state the plan-slice work-unit rule.'
    }

    # The two run paths must stay stated where a new member's assistant reads them, and
    # the version gate must stay a condition of every Definition of Demoable. These are
    # deliberately static text and presence checks. Whether the Compose topology is
    # actually correct for a version is a runtime question, and it belongs to that
    # version's integration gate, not to a validator that has to stay fast and offline.
    # This never starts Docker, and it never compares Compose services against a
    # version's role list, because VERSIONS.md is the only source for that mapping.
    $versions = Read-RepoFile 'implementation-plan/VERSIONS.md'

    $checks += 3
    if ($agents -notmatch 'Docker Compose is the authoritative' -or
        $agents -notmatch 'host commands whenever that is faster') {
        Add-Failure 'AGENTS.md does not state the host-development versus Compose-integration run paths.'
    }
    if ($agents -notmatch 'not integration-demo ready merely because host-based tests pass' -and
        $agents -notmatch 'not integration-demo ready merely because host tests pass') {
        Add-Failure 'AGENTS.md does not state the Compose integration gate for a completed version.'
    }
    if ($agents -notmatch 'must not start containers or services that belong only to a later version') {
        Add-Failure 'AGENTS.md does not forbid starting a later version''s services early.'
    }

    $checks += 2
    if ($versions -notmatch '(?m)^## Compose integration gate \(every version\)\s*$') {
        Add-Failure 'VERSIONS.md does not carry the Compose integration gate that every Definition of Demoable relies on.'
    }
    if ($versions -notmatch 'no service that belongs only to a later version') {
        Add-Failure 'VERSIONS.md Compose integration gate does not forbid a later version''s services.'
    }

    $checks += 2
    if ($readme -notmatch 'docker compose up --build') {
        Add-Failure 'README.md does not document the full-system Docker Compose command.'
    }
    if ($readme -notmatch '(?m)^## Two run paths\s*$') {
        Add-Failure 'README.md does not name the host-development and full-system run paths.'
    }

    # Version advancement stays a user decision, and assignment alone never authorizes it.
    $checks += 3
    if ($agents -notmatch 'does not authorize implementing V\(N\+1\)' -or $agents -notmatch 'V\(N\+1\) NOT AUTHORIZED') {
        Add-Failure 'AGENTS.md does not state the version authorization invariant.'
    }
    if ($planReadme -notmatch 'does not authorize implementing V\(N\+1\)' -or $planReadme -notmatch 'V\(N\+1\) NOT AUTHORIZED') {
        Add-Failure 'Implementation plan does not state the version authorization invariant.'
    }
    if ($agents -notmatch 'never advances' -or $agents -notmatch 'never creates a version tag') {
        Add-Failure 'AGENTS.md does not reserve version advancement and tagging for the user.'
    }

    # The tracker header is the single current-state view; it must carry its fields.
    $trackingHeaderFields = @(
        'Implementation status',
        'Current target version',
        'Previous version',
        'Last verified commit',
        'Next allowed action'
    )
    foreach ($trackingHeaderField in $trackingHeaderFields) {
        $checks++
        if ($tracking -notmatch ('(?m)^\|\s*' + [regex]::Escape($trackingHeaderField) + '\s*\|')) {
            Add-Failure "TRACKING.md current-state header is missing the field: $trackingHeaderField"
        }
    }

    $checks += 2
    if ($tracking -notmatch 'JOURNAL\.md') {
        Add-Failure 'TRACKING.md does not reference the implementation journal.'
    }
    if ($journal -notmatch '(?m)^## What must never go here\s*$') {
        Add-Failure 'JOURNAL.md does not state what must never be recorded in it.'
    }

    $checks += 2
    if ($standards -notmatch 'It never creates architecture rules') {
        Add-Failure 'CODING_STANDARDS.md does not stay subordinate to the frozen architecture.'
    }
    if ($workflow -notmatch 'CODING_STANDARDS\.md' -or $agents -notmatch 'CODING_STANDARDS\.md') {
        Add-Failure 'Coding standards are not referenced from the agent entry points.'
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
    if (-not $agentsArchitectureVersionMatch.Success -or -not $baselineVersionMatch.Success -or
        $agentsArchitectureVersionMatch.Groups[1].Value -ne $baselineVersionMatch.Groups[1].Value) {
        Add-Failure 'AGENTS.md architecture version does not match the baseline.'
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
            $actualFreezeHash = Get-NormalizedFileSha256 -Path $frozenPath
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

    $canonicalSkillRoot = '.agents/skills'
    $canonicalSkillRootPath = Join-Path $repoRoot ($canonicalSkillRoot -replace '/', [IO.Path]::DirectorySeparatorChar)
    $skillNames = New-Object System.Collections.Generic.HashSet[string]
    if (-not (Test-Path -LiteralPath $canonicalSkillRootPath -PathType Container)) {
        Add-Failure "Missing canonical project skill directory: $canonicalSkillRoot"
    }
    else {
        foreach ($skillDirectory in Get-ChildItem -LiteralPath $canonicalSkillRootPath -Directory) {
            [void]$skillNames.Add($skillDirectory.Name)
            $checks++
            $skillFile = Join-Path $skillDirectory.FullName 'SKILL.md'
            if (-not (Test-Path -LiteralPath $skillFile -PathType Leaf)) {
                Add-Failure "Installed skill lacks SKILL.md: $canonicalSkillRoot/$($skillDirectory.Name)"
            }
        }
    }

    foreach ($skillName in $skillNames) {
        $checks += 2
        $escapedName = [regex]::Escape($skillName)
        if ($manifest -notmatch "(?m)^\s+- name:\s*$escapedName\s*$") {
            Add-Failure "Installed skill is absent from manifest: $skillName"
        }
        if ($lock -notmatch "(?m)^\s+- name:\s*$escapedName\s*$") {
            Add-Failure "Installed skill is absent from lock: $skillName"
        }
    }

    # .agents/skills is the canonical, tracked skill set. .claude/skills and
    # .codex/skills are committed mirrors of it, so a clone needs no bootstrap step
    # and both assistants load the same skills. Every mirror must exist and match the
    # canonical content exactly; drift is a build failure, not a convention.
    $mirrorRoots = @('.claude/skills', '.codex/skills')
    foreach ($mirrorRoot in $mirrorRoots) {
        $mirrorRootPath = Join-Path $repoRoot ($mirrorRoot -replace '/', [IO.Path]::DirectorySeparatorChar)
        $checks++
        if (-not (Test-Path -LiteralPath $mirrorRootPath -PathType Container)) {
            Add-Failure "Missing project skill mirror directory: $mirrorRoot"
            continue
        }
        foreach ($mirrorDirectory in Get-ChildItem -LiteralPath $mirrorRootPath -Directory) {
            $checks += 2
            if (-not (Test-Path -LiteralPath (Join-Path $mirrorDirectory.FullName 'SKILL.md') -PathType Leaf)) {
                Add-Failure "Skill mirror lacks SKILL.md: $mirrorRoot/$($mirrorDirectory.Name)"
            }
            if (-not $skillNames.Contains($mirrorDirectory.Name)) {
                Add-Failure "Skill mirror has no canonical .agents copy: $mirrorRoot/$($mirrorDirectory.Name)"
            }
        }
    }

    foreach ($skillName in ($skillNames | Sort-Object)) {
        $canonicalSkillPath = Join-Path $canonicalSkillRootPath $skillName
        $canonicalTreeHash = Get-SkillTreeHash $canonicalSkillPath
        foreach ($mirrorRoot in $mirrorRoots) {
            $checks++
            $mirrorPath = Join-Path $repoRoot (($mirrorRoot + '/' + $skillName) -replace '/', [IO.Path]::DirectorySeparatorChar)
            if (-not (Test-Path -LiteralPath $mirrorPath -PathType Container)) {
                Add-Failure "Skill is missing from $mirrorRoot and that assistant will not load it: $skillName"
                continue
            }
            if ((Get-SkillTreeHash $mirrorPath) -ne $canonicalTreeHash) {
                Add-Failure "Skill mirror is out of sync with $canonicalSkillRoot/$($skillName): $mirrorRoot/$skillName"
            }
        }
    }

    $treeLockedEntries = [regex]::Matches(
        $lock,
        '(?ms)^  - name:\s*(?<name>[^\r\n]+)\r?\n(?<body>.*?)(?=^  - name:|\z)'
    )
    foreach ($treeLockedEntry in $treeLockedEntries) {
        $entryName = $treeLockedEntry.Groups['name'].Value.Trim()
        $entryBody = $treeLockedEntry.Groups['body'].Value
        $treeHashMatch = [regex]::Match($entryBody, '(?m)^    treeSha256:\s*([A-Fa-f0-9]{64})\s*$')
        if (-not $treeHashMatch.Success) {
            continue
        }

        $checks += 3
        $treeAlgorithmMatch = [regex]::Match($entryBody, '(?m)^    treeHashAlgorithm:\s*(.+?)\s*$')
        if (-not $treeAlgorithmMatch.Success -or $treeAlgorithmMatch.Groups[1].Value -ne 'sha256-of-sorted-relative-path-tab-lf-normalized-file-sha256-lines') {
            Add-Failure "Unsupported or missing tree-hash algorithm for skill: $entryName"
            continue
        }

        $canonicalDestinationMatch = [regex]::Match($entryBody, '(?m)^    canonicalDestination:\s*(.+?)\s*$')
        if (-not $canonicalDestinationMatch.Success) {
            Add-Failure "Tree-locked skill lacks canonical destination: $entryName"
            continue
        }

        $canonicalDestination = $canonicalDestinationMatch.Groups[1].Value.Trim()
        $canonicalPath = Join-Path $repoRoot ($canonicalDestination -replace '/', [IO.Path]::DirectorySeparatorChar)
        if (-not (Test-Path -LiteralPath $canonicalPath -PathType Container)) {
            Add-Failure "Tree-locked skill destination does not resolve: $canonicalDestination"
            continue
        }

        $actualTreeHash = Get-SkillTreeHash $canonicalPath
        if ($null -eq $actualTreeHash) {
            Add-Failure "Tree-locked skill contains no files: $entryName"
            continue
        }

        # Every skill must declare both mirrors, so nothing can be tracked as
        # canonical-only and quietly go missing for one of the two assistants.
        $checks++
        $declaredMirrors = [regex]::Matches($entryBody, '(?m)^      - (\.(?:claude|codex)/skills/[^
]+)\s*$') |
            ForEach-Object { $_.Groups[1].Value.Trim() }
        foreach ($expectedMirror in @(".claude/skills/$entryName", ".codex/skills/$entryName")) {
            if ($declaredMirrors -notcontains $expectedMirror) {
                Add-Failure "Skill lock does not declare mirror ${expectedMirror}: $entryName"
            }
        }

        if ($actualTreeHash -ne $treeHashMatch.Groups[1].Value.ToLowerInvariant()) {
            Add-Failure "Locked skill tree changed: $entryName"
        }

        $sourceRepositoryMatch = [regex]::Match($entryBody, '(?m)^    sourceRepository:\s*(.+?)\s*$')
        if ($sourceRepositoryMatch.Success -and $sourceRepositoryMatch.Groups[1].Value -eq 'https://github.com/mattpocock/skills') {
            $checks++
            if ($entryBody -notmatch '(?m)^    version:\s*[A-Fa-f0-9]{40}\s*$') {
                Add-Failure "Matt Pocock skill is not pinned to an exact commit: $entryName"
            }
        }
    }

    $checks++
    try {
        $cliSkillLock = Read-RepoFile 'skills-lock.json' | ConvertFrom-Json
        foreach ($treeLockedEntry in $treeLockedEntries) {
            $entryName = $treeLockedEntry.Groups['name'].Value.Trim()
            $entryBody = $treeLockedEntry.Groups['body'].Value
            if ($entryBody -notmatch '(?m)^    sourceRepository:\s*https://github\.com/mattpocock/skills\s*$') {
                continue
            }
            $checks++
            if ($null -eq $cliSkillLock.skills.$entryName) {
                Add-Failure "Matt Pocock skill is absent from skills-lock.json: $entryName"
            }
        }
    }
    catch {
        Add-Failure "skills-lock.json is not valid JSON: $($_.Exception.Message)"
    }

    $checks += 2
    $manualArchitectureSkill = Read-RepoFile '.agents/skills/improve-codebase-architecture/SKILL.md'
    $manualArchitectureOpenAi = Read-RepoFile '.agents/skills/improve-codebase-architecture/agents/openai.yaml'
    if ($manualArchitectureSkill -notmatch '(?m)^disable-model-invocation:\s*true\s*$') {
        Add-Failure 'improve-codebase-architecture is not user-invoked/manual-only in SKILL.md.'
    }
    if ($manualArchitectureOpenAi -notmatch '(?s)policy:.*allow_implicit_invocation:\s*false') {
        Add-Failure 'improve-codebase-architecture permits implicit Codex invocation.'
    }

    $markdownFiles = @(
        (Join-Path $repoRoot 'README.md'),
        (Join-Path $repoRoot 'AGENTS.md'),
        (Join-Path $repoRoot 'CLAUDE.md'),
        (Join-Path $repoRoot 'CODING_STANDARDS.md')
    ) +
        @(Get-ChildItem -LiteralPath (Join-Path $repoRoot 'docs') -Filter '*.md' -File -Recurse | ForEach-Object { $_.FullName }) +
        @(Get-ChildItem -LiteralPath (Join-Path $repoRoot 'implementation-plan') -Filter '*.md' -File | ForEach-Object { $_.FullName })

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
