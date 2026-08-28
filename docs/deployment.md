# GitHub Pages 배포

이 프로젝트는 GitHub Actions에서 Next.js를 정적 HTML·CSS·JavaScript로 빌드하고 GitHub Pages에 배포한다. 별도 서버는 사용하지 않는다.

## 동작 구조

```text
사용자 브라우저
  → 사용자가 자신의 Lost Ark API 키 입력
  → Lost Ark Open API 직접 조회
  → 캐릭터 원본과 편집용 세팅을 IndexedDB에 저장
  → 브라우저에서 시뮬레이션 및 DPS 계산

main push
  → GitHub Actions 타입 검사·정적 빌드
  → GitHub Pages 배포
```

API 키는 React 상태에만 존재하고 Local Storage, IndexedDB, 소스 코드, GitHub Secrets에 저장하지 않는다. 페이지를 새로 열면 다시 입력해야 한다.

## 최초 설정

GitHub 저장소의 `Settings → Pages → Build and deployment`에서 Source를 `GitHub Actions`로 선택한다. 저장소 Secret은 필요하지 않다.

## 배포

`main` 브랜치에 push하면 `.github/workflows/deploy-pages.yml`이 실행된다. 수동 배포는 GitHub `Actions → Deploy GitHub Pages → Run workflow`에서 실행할 수 있다.

프로젝트 페이지 주소는 다음 형태다.

```text
https://sev1004.github.io/lostark-dps-simulator-as-/
```

워크플로가 완료된 뒤 배포 작업의 environment URL에서 실제 주소를 확인한다.

## 로컬 확인

```powershell
pnpm dev
pnpm build
```

정적 빌드는 `out` 폴더에 생성된다.

## 브라우저 저장 범위

캐릭터 데이터는 사이트 origin의 IndexedDB에 저장된다. 저장 데이터는 같은 기기와 브라우저에서만 복원되며, 사이트 데이터를 삭제하거나 시크릿 모드를 종료하면 사라질 수 있다.
