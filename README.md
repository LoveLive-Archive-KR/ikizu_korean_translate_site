# 이키즈라이브 번역 아카이브

`messages.db`의 공식 계정 번역을 월별로 볼 수 있는 정적 사이트입니다.

## 실행

```sh
python3 scripts/export_data.py
python3 -m http.server 5173 --directory dist
```

http://localhost:5173 에서 확인합니다. DB 갱신 후 export 명령을 다시 실행하세요.

- 한국 시간(UTC+9) 기준 실제 게시일로 월을 분류합니다. 게시일은 X snowflake ID에서 계산하며 DB의 수집 시각과 구분합니다.
- `corrected_text`가 있으면 수정 번역을 우선합니다.
- 월별 탐색, 전체 기간 검색, 번역/원문 검색, 정렬, 원문 펼치기, 첨부 이미지, 원문 링크를 제공합니다.
- URL에 월과 검색 조건을 보존합니다. 한 번에 20개씩 표시합니다.
- 원본 DB와 Discord 메시지/채널 ID는 배포하지 않습니다. 번역 데이터는 `dist/data.json`에 내보냅니다.
- 첨부 이미지는 원본 외부 URL을 사용하며 삭제 또는 접근 제한 시 열기 링크로 표시합니다.
- 자동 DB 동기화는 없습니다. 새 자료 반영에는 재내보내기와 재배포가 필요합니다.
