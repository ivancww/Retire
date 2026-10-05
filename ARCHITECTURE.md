# Retire architecture

Version: `0.6.0`

Retire is an independent repository and deployment. AVA Platform is the source of truth for architecture, navigation, responsive behaviour, PWA boundaries, security, backup/restore and the canonical design language. Retire owns the retirement conversation, calculations, official retirement datasets and domain workflow; it does not copy AVA Platform or 5pay source.

## Canonical AVA shell consumption

Retire follows the Mother-supported Independent App model: the AVA shell is implemented locally in this repository and is independently deployed. It does not runtime-import `avaplatform` or depend on a relative path into that repository. The synchronized canonical assets in `design-system/` are loaded in Mother order: `tokens.css`, `components.css`, then `frontend.css`; Retire's `styles.css` contains only Retire product composition and specialized interaction layout.

The production Pages workflow validates pull requests and development changes without deploying them. Only `main` may enter the protected `github-pages` environment and publish `https://ivancww.github.io/Retire/`.

## Ownership and storage

- Official Layer: `ENDPOINT` returns defaults, content, stages, and the `回報表設定` return-plan registry. A valid response is cached locally as `retire:official-cache:v1`; cache is never a User Override.
- User Layer: `retire:user-data:v1` stores local working inputs plus the separate `userOverrides` presentation object; neither is sent to GAS. User Overrides remain independent from the Official cache.
- Presentation User Overrides: `presentationTitle` and `presentationSubtitle` are not fields in the current Retire Official schema (which contains retirement defaults, stages and return-plan data). Official Default precedence is therefore not applicable to these two product presentation fields; their supported fallback is the built-in Retire copy, overridden only by the local User Layer. Official refresh cannot overwrite them, Preview is draft-only, and Save Local writes only `retire:user-data:v1`.
- Current implementation uses local structured storage only. AVA Platform remains the owner of shared backup/restore and common identity services; this app does not create a second User Workspace or backup system.
- The persistent `返回 AVA` control is present on every Frontstage view, including Summary, Explore and Customer Presentation, and points to the verified AVA Platform deployment at `https://ivancww.github.io/avaplatform/`.
- `?avaEntry=frontend` and unsupported entries use the normal customer Frontstage. `?avaEntry=user` uses that same Frontstage with a User Edit control for presentation-only local overrides, followed by Preview and Save Local. `?avaEntry=admin` is a grant-gated Retire-owned Official management surface; the URL alone never authorizes it.

## Flow and calculation contract

Understand → Simplify → Quantify → Visualize → Converse → Discover → Deepen → Explore → Present. The conversation obtains current age before desired retirement age, then asks only for approximate resources, retirement earmarking, broad categories, purchasing power and a visible growth assumption. The calculation is preceded by a short income-replacement concept; the solution view derives annual contribution, contribution years and total contribution from the existing gap and years. Medical need is explicitly separate and legacy is an independent objective.

All gap comparisons use retirement-date values: future lifestyle need versus projected existing resources. Current resources are projected using the user-visible growth assumption before comparison. Inflation continues through every retirement stage even when a stage ratio is reduced.

## Dynamic return plans

`returnPlans` is normalized from the GAS envelope without dropping `payload.data`, from official `returnPlans`, `return_plans`, or the Sheet-shaped `回報表設定`. Each enabled registry row and matching return sheet makes a plan available after refresh without an app-code change. Stable `planId` is the identity. Each return row is independently read as `policyYear`, `withdrawalRate`/`withdrawalPercent`, and `multiplier`; no fixed plan list, withdrawal pattern, interpolation, or inferred percentage is used. The Frontstage selects one enabled plan at a time and uses the exact retirement policy-year row. The money result uses the existing 5pay Saving Plan semantics: total contribution × official multiplier; a non-matching contribution period returns unavailable rather than scaling or inventing a formula.

## GAS contract

Official endpoint: `https://script.google.com/macros/s/AKfycbyaup9srjMJkdvzgixi4Kjs9lT6RRI2L-CMqJB-QLuQ2u0grArDxq3vI_4hZyr6PiPOAw/exec`. The runtime asks for `?action=bootstrap`; schema normalization tolerates the documented bilingual field names. The current live Sheet was audited as `設定`, `頁面設定`, `選項設定`, `退休階段`, `資產類別`, `計算設定`, `回報表設定`, plus registered return-plan tabs. `gas/RetireAdminApi.gs` supplies the Mother-supported Admin helper: `avaAdminLaunch` exchange, server-side `verifyAppGrant`, fixed App-owned schema routes, validation, locking, acknowledgement and re-read. It must be integrated into the deployed Retire GAS handler; the existing live GAS source is not present in this repository, so live protected-write verification remains pending.

## Retire Admin security boundary

Retire adapts the current Mother contract used by Medical. AVA Studio issues the short-lived, one-time `avaAdminLaunch`; the Retire backend exchanges it with Platform and keeps the opaque App grant only in memory in the browser. Each Official read/write is sent to the Retire backend, which verifies the grant server-to-server with App ID `retire` and the requested operation before reading or mutating the bound Retire Sheet. Mutations use explicit allowlisted domains and fields, preserve the dynamic return-plan registry, reject arbitrary sheet/range input, validate the complete payload before a locked replacement, acknowledge success, and re-read Official data. Admin never writes `retire:user-data:v1`.

## PWA and presentation

The standalone manifest/service worker are scoped to Retire. The Frontstage flow is Summary → Explore Dynamic Saving Return Plans → Customer Presentation. Only one supported accumulation strategy is selected and displayed at a time; contribution facts remain unchanged when it changes. Customer Presentation is a view of the current completed planning data, hides non-essential detail while retaining the narrative, money result, visual, persistent Return AVA control and an explicit exit control. CSS uses the AVA token values and responsive boundaries (compact ≤650px, wide ≥1000px), with safe-area padding and 44px controls. No device/viewport switcher is part of the production Frontstage; responsive behavior is automatic. Physical iPad/foldable browser verification is still required.
