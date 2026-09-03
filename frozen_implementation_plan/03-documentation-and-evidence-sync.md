# Demo flow and truthfulness synchronization

`FIN-04` produces the canonical demo. `FIN-05` makes the tracked documents true.
Read [README.md](README.md) first.

---

## FIN-04 - Canonical demo flow

**Status:** NOT STARTED · **Priority:** MUST · **Reasoning level:** Medium

### Problem

`docs/demo-script.md` predates this release and is already stale. Without a
single agreed flow, the demo becomes an improvised page tour, and each step stops
carrying the requirement and the architecture point it exists to demonstrate.

### Required outcome

One rehearsed flow, short enough to run inside the defense slot. The story shape:

```text
Market / realtime
  -> Strategy catalog
    -> Manual composite
      -> Backtest
        -> Automated composite discovery
          -> Leaderboard
            -> Provenance
              -> News and sentiment isolation
```

For each step, record three short lines - and only where each genuinely exists:

- **Visible behavior:** what appears on screen.
- **Requirement:** which official requirement it satisfies.
- **Architecture point:** which decision or proof it demonstrates, drawn only
  from the claimable set in `README.md` section C.

Do not pad steps with an architecture point that is not really there. A step that
only shows a requirement is fine.

### Constraints

- Every architecture statement in the script must map to a row in the claimable
  set. Nothing outside it.
- The automated composite discovery step is the one never demonstrated before.
  Give it real attention.
- No screenshots and no slides. The running system is the evidence.
- No feature appears in the script that the system does not do.

### Dependencies

`FIN-01` through `FIN-03`. The script describes what the final system does.

### Acceptance criteria

1. `docs/demo-script.md` describes the flow above and nothing the system cannot
   do.
2. Every architecture claim in it maps to a claimable-set row.
3. It has been run end to end once, on the Compose topology, in `FIN-06`.

### Targeted validation

One real rehearsal, during `FIN-06`. That is the validation. No test.

### Non-goals

- No second script for a different audience.
- No slide deck, video, or screenshot set.
- No demo of V6 capability.

---

## FIN-05 - Truthfulness synchronization

**Status:** NOT STARTED · **Priority:** MUST · **Reasoning level:** Medium,
High only if a truthfulness question needs cross-file reasoning

### Problem

Some tracked documents state things that are false today, and `FIN-01` makes one
more claim true that was not true before. A false statement in a tracked document
is the most expensive defect in an architecture defense, because it makes every
other claim suspect.

### The rule

**Change a document only if leaving it unchanged would create a false or
misleading statement during the defense.** Nothing else. This is truthfulness
sync, not documentation cleanup.

Do not audit a document merely because it exists. Do not rewrite history. Do not
improve wording.

### What to change

**MUST update:**

| Document | Why |
|---|---|
| `docs/demo-script.md` | Says the baseline is V1-V4 and V5 is not frozen. V5 was frozen at `v5.0-demo` on 2026-09-01. Also carries the `FIN-04` flow. |
| `implementation-plan/VERSIONS.md` | Its "minimum product list fully satisfied" claim depends on the composite-discovery interpretation. Add a short note recording the accepted reading and the outcome. Do not rewrite the V3 or V5 history. |
| `implementation-plan/TRACKING.md` | Must reflect the final state. |
| `implementation-plan/JOURNAL.md` | Append one entry for this release. Never edit an existing entry. |
| `docs/final-defense-notes.md` | **One** new document, two sections. Holds both the known limitations and the unsupported claims. Link it from `docs/demo-script.md`, which is where the presenter will already be looking. |

**One document, not several.** Optimize for retrieval during the oral defense,
not for documentation taxonomy. Two sections:

```text
Known limitations
Claims not supported by evidence
```

**Verify, and update only if actually false:**

- `README.md`
- Any evidence file re-run in `FIN-06`
- Diagrams 05, 06, and 10, only if one explicitly states that search produces
  single strategies. If a diagram describes candidates generically, it is still
  true and needs no change.

Check these quickly. Do not read them line by line.

**Do not touch, unless a real architecture deviation was discovered:**

- `docs/architecture/architecture-baseline.md`
- Any accepted ADR
- `docs/validation/architecture-proof-plan.md`
- `AGENTS.md`, `CODING_STANDARDS.md`, `docs/agents/*`

The baseline is frozen. Editing a frozen baseline to record that planned work is
now done destroys the meaning of the freeze. `FIN-01` changes no boundary,
ownership, dependency direction, contract, or persistence decision.

The relaxed testing policy of this release is recorded **only** in
`frozen_implementation_plan/`. Do not write it back into the permanent workflow
documents as if it were policy.

### Section "Known limitations": required content

Three entries, short.

**1. Deferred account requirement / single operator.** Why it is absent and what
supporting it would cost. The owner's own framing is the right one:

> The current certified realization assumes one operator. Account-based ownership
> was introduced as a late requirement after the existing baseline. It was not
> included in the final pre-defense realization. Supporting it would introduce
> identity propagation and ownership enforcement, especially for user-created
> saved composite strategies.

**2. Frontend policy options are not metadata-driven.** Wording matters here, and
the loose version is factually wrong about the architecture. Use this:

> The backend architecture supports versioned CombinationPolicy components, but
> selectable policy options in the current frontend are not metadata-driven.
> Adding a new policy therefore currently requires a frontend change because no
> policy catalog endpoint exists.

Do not write "combination policies are not extensible" or anything implying that
policy extensibility is architecturally absent. It is a UI integration
limitation, not a domain architecture limitation, and the distinction is exactly
the kind an examiner will probe.

**3. Automated composite discovery** — only if `FIN-01` was reverted under the
stop-loss policy. If `FIN-01` landed, this entry does not exist.

### Section "Claims not supported by evidence": required content

Everything outside the claimable set in `README.md` section C, stated as a
prohibition. At minimum: no queue scaling claim, no candidate-volume or
throughput claim, no outbox reliability claim, no broker retry claim, no
duplicate-safety claim, no latency claim, and no claim about any V6 property.
`PROOF-RT-001` disclaims a latency target in its own text.

### Dependencies

`FIN-01` through `FIN-04`. The true statement is only known once the code is
final.

### Acceptance criteria

1. No tracked document states something the final code does not do.
2. `docs/final-defense-notes.md` exists, has both sections, and is linked from
   the demo script.
3. The policy limitation is worded as a UI integration limitation, not as an
   architecture limitation.
4. `TRACKING.md` and `JOURNAL.md` reflect the final state.
5. No baseline, ADR, proof-definition, or permanent workflow document was
   changed.
6. The governance validator passes after the document changes.

### Truth checkpoint

After `FIN-04` and `FIN-05`, read the demo script and the defense notes together
once and confirm neither claims anything beyond the claimable set in `README.md`
section C. No test run. That is the whole checkpoint.

### Targeted validation

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-repo-governance.ps1
```

Two mechanical cautions. The validator link-checks `README.md`, `AGENTS.md`,
`CLAUDE.md`, `CODING_STANDARDS.md`, `docs/**`, and `implementation-plan/*.md`, so
every new link must resolve. It also forbids certain historical process strings
in tracked text; keep new documents free of them.

### Non-goals

- No documentation cleanup that does not change truthfulness.
- No second or third new document. One defense-notes file is the whole artifact.
- No new ADR.
- No new proof definition.
- No rewriting of past journal or version history.
