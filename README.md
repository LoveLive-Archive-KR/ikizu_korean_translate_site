# 이키즈라이브 번역 아카이브

`messages.db`의 멤버별 번역을 월별로 볼 수 있는 정적 사이트입니다.

## 실행

```sh
python3 scripts/export_data.py
python3 -m http.server 5173 --directory dist
```

http://localhost:5173 에서 확인합니다. DB 갱신 후 export 명령을 다시 실행하세요.

- 한국 시간(UTC+9) 기준 실제 게시일로 월을 분류합니다. 게시일은 X snowflake ID에서 계산하며 DB의 수집 시각과 구분합니다.
- `corrected_text`가 있으면 수정 번역을 우선합니다.
- 월별 탐색, 멤버 필터, 전체 기간 검색, 이름/계정/번역/원문 검색, 정렬, 원문 펼치기, 첨부 이미지, 원문 링크를 제공합니다.
- URL에 월, 멤버와 검색 조건을 보존합니다. 한 번에 20개씩 표시합니다.
- 원본 DB와 Discord 메시지/채널 ID는 배포하지 않습니다. 번역 데이터는 `dist/data.json`에 내보냅니다.
- 첨부 이미지는 원본 외부 URL을 사용하며 삭제 또는 접근 제한 시 열기 링크로 표시합니다.
- 자동 DB 동기화는 없습니다. 새 자료 반영에는 재내보내기와 재배포가 필요합니다.

## 프로필 사진

DB의 `twitter_handle`과 `character_name`을 기준으로 매칭합니다. 계정별 X 프로필 이미지를 [Unavatar](https://unavatar.io)로 가져와 `dist/avatars/`에 저장했습니다. 계정 매핑과 이미지 출처는 `scripts/avatar_sources.json`에 기록합니다. 이름은 [공식 멤버 소개](https://www.lovelive-anime.jp/lovehigh/member/?m=2)를 참고한 한국어 표기입니다. 사진은 저장 시점의 스냅샷이며 자동 갱신되지 않습니다. 새 계정 추가 시 매핑과 이미지를 함께 추가하세요.

DB에 `media_urls` 열이 없어도 내보낼 수 있습니다. 첨부 이미지 정보가 없는 DB에서는 게시물 이미지를 표시하지 않습니다.
