# Retire architecture

Version: `0.2.0`

Retire is an independent repository and deployment. AVA Platform is the source of truth for architecture, navigation, responsive behaviour, PWA boundaries, security, backup/restore and the canonical design language. Retire owns the retirement conversation, calculations, official retirement datasets and domain workflow; it does not copy AVA Platform or 5pay source.

## Ownership and storage

- Official Layer: `ENDPOINT` returns defaults, content, stages, and the `回報表設定` return-plan registry. A valid response is cached locally as `retire:official-cache:v1`; cache is never a User Override.
- User Layer: `retire:user-data:v1` stores only the local working inputs and is never sent to GAS. It remains independent from official cache.
- Current implementation uses local structured storage only. AVA Platform remains the owner of shared backup/restore and common identity services; this app does not create a second User Workspace or backup system.
- The persistent `返回 AVA` control is present on the primary Frontstage. Deployment integration must set the actual relative/registered AVA destination for its hosting topology.

## Flow and calculation contract

Understand → Simplify → Quantify → Visualize → Converse → Discover → Deepen → Explore → Present. The conversation obtains current age before desired retirement age, then asks only for approximate resources, retirement earmarking, broad categories, purchasing power and a visible growth assumption. Medical need is explicitly separate and legacy is an independent objective.

All gap comparisons use retirement-date values: future lifestyle need versus projected existing resources. Current resources are projected using the user-visible growth assumption before comparison. Inflation continues through every retirement stage even when a stage ratio is reduced.

## Dynamic return plans

`returnPlans` is normalized from the GAS envelope without dropping `payload.data`, from official `returnPlans`, `return_plans`, or the Sheet-shaped `回報表設定`. Each enabled registry row and matching return sheet makes a plan available after refresh without an app-code change. Stable `planId` is the identity. Each return row is independently read as `policyYear`, `withdrawalRate`/`withdrawalPercent`, and `multiplier`; no fixed plan list, withdrawal pattern, interpolation, or inferred percentage is used.

## GAS contract

Official endpoint: `https://script.google.com/macros/s/AKfycbyaup9srjMJkdvzgixi4Kjs9lT6RRI2L-CMqJB-QLuQ2u0grArDxq3vI_4hZyr6PiPOAw/exec`. The runtime asks for `?action=bootstrap`; schema normalization tolerates the documented bilingual field names. Actual endpoint response could not be inspected in this environment because DNS/network access was blocked, so production payload validation remains pending.

## PWA and presentation

The standalone manifest/service worker are scoped to Retire. Customer Presentation mode hides non-essential controls while retaining the narrative, hero number and visual. CSS uses the AVA token values and responsive boundaries (compact ≤650px, wide ≥1000px), with safe-area padding and 44px controls. Physical iPad/foldable browser verification is still required.
