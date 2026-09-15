# UI layout contract

## Coordinates and sizes

- Do not use CSS zoom or transform scale for layout sizing. All measured positions are viewport CSS pixels.
- Existing dimensions use `calc(N * var(--ui-px))` to preserve the pre-migration appearance: desktop shell 1.5px per old unit, mobile 1px, detached doping panel 1.2px. These are length tokens, not coordinate transforms.
- Media query thresholds remain in viewport px. Do not multiply breakpoints by the size tokens.
- New shared spacing uses physical tokens: small 6px, field 9px, group 18px. Preserve existing spacing until the relevant group is intentionally redesigned.
- Existing UI dimensions are fixed by default. Do not shrink or enlarge an existing element's width, height, font size, icon size, or spacing during another UI change unless the user explicitly requests that dimension change.
- Same-row controls use the same box model and height (compact 33px, large 57px); checkbox/radio sizes are independent. Use flex/grid alignment, not translateY, to center controls.
- Text labels and input values must not be clipped. An intentionally shortened skill name may use ellipsis with a tooltip. Numeric fields must show 100.00 and 36.41 in full.
- Flash Orb stage and uptime controls share a grid column, left edge, width and height.
- Panel gaps are measured from the outer workspace border: left 12px, right 8px. Panels move into normal flow when there is insufficient space. Never clamp a floating panel into the workspace.
- Panel height follows content; fixed heights must not cut off the last control. Small screens may scroll vertically, not hide controls.

## Repeatable verification

### Width rules when rearranging controls

- 같은 편집 그룹의 위아래 행은 왼쪽과 오른쪽 끝선을 공유한다. 품질 행의 너비는 `품질` 라벨, 간격, 입력란을 합친 전체 너비로 비교한다.
- 너비는 부모의 공통 열 또는 공통 너비 변수에서 결정한다. 행을 옮겼다고 셀렉트 하나에만 `width: 100%`를 주거나 각각 다른 고정 너비를 추가하지 않는다.
- 한 행에 셀렉트가 두 개이면 두 칸과 간격을 합친 너비를 아래 행과 맞춘다. 개별 컨트롤을 모두 동일한 너비로 만드는 규칙은 아니다.
- 새로운 그룹에는 `data-ui-width-group="그룹명"`, 비교할 직계 자식 행에는 `data-ui-width-row`를 지정한다. DOM 하네스는 행의 양쪽 끝선과 부모 영역 넘침을 검사한다. 기존 전투 장비의 통합 셀렉트/품질 행도 자동 검사한다.
- 허용 오차는 1 CSS px다. 화면이 좁아지면 그룹 전체가 함께 줄거나 반응형으로 재배치되어야 한다. 검사 실패 상태에서 너비 정렬 완료로 보고하지 않는다.

### Execution

1. Run `npm run check:ui` and typecheck after UI edits.
2. Use the browser skill with a loaded character on localhost. Import `auditUiLayout` from `scripts/ui-layout-audit.mjs` in the browser's Node tool and pass `auditUiLayout.toString()` to `tab.playwright.evaluate` as a invoked function expression. It only reads rendered DOM and never reads credentials or storage.
3. Audit both simulator tabs at 1920, 1440, 1024, 768 and 390px widths. Also inspect the last panel row and scrolling. `incomplete` is not a pass: load a character first.
4. Compare pre/post rectangles and screenshots at the same viewport and scroll position. Allow 1 CSS px for subpixel rounding; intentional responsive reflow is not a size regression.
5. Record actual tested tabs and widths, any failures, and untested states. A successful build does not establish visual correctness.

Example after browser-skill setup:

```js
const { auditUiLayout } = await import('E:/dev/Glavier_dps_Simulator/scripts/ui-layout-audit.mjs');
nodeRepl.write(await tab.playwright.evaluate(`(${auditUiLayout.toString()})()`));
```

The source check guards known coordinate regressions. The DOM audit checks panel gaps, containment, control alignment, Flash Orb columns, and the Basic Equipment tab placement (combat equipment/avatar, accessories/engraving, and Ark Grid). Neither replaces screenshot review of text wrapping and uninstrumented groups.
