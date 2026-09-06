# UI 구현 지침

- 모든 UI 구성 요소는 같은 행과 그룹 안에서 상단·하단 기준선, 높이, 간격을 일관되게 맞춘다.
- 입력창, 셀렉트 박스, 버튼처럼 나란히 배치되는 요소는 동일한 높이와 박스 모델을 사용하고 기본 여백으로 어긋나지 않게 한다.
- 반응형 레이아웃에서도 정렬 기준과 간격이 깨지지 않는지 확인한 뒤 작업을 완료한다.
- UI 전체 구현이 완료되었다고 사용자가 확인하기 전까지 JSX는 멀티라인 구조로 유지한다.
- 사용자가 전체 구현 완료를 선언한 뒤에만 JSX 압축을 선택 사항으로 제안한다.
- 초각성 스킬은 맹룡난무와 적룡필살로 정의하며, 도약 효과는 해당 스킬에만 적용한다.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
