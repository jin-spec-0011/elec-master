#!/usr/bin/env bash
# 커밋된 파일에 기출 PDF·자격 증명이 섞였는지 검사한다. (로컬·Actions 공용)
# 사용: bash tools/guard.sh        종료 코드 0 = 통과, 1 = 차단 대상 발견
set -uo pipefail

cd "$(git rev-parse --show-toplevel)" || exit 2
fail=0

echo "[guard] 금지 파일명 검사"
bad_names=$(git ls-files | grep -Ei '(\.pdf$|\.pem$|\.p12$|(^|/)\.env(\.|$)|serviceaccount|service-account|firebase-adminsdk)' || true)
if [ -n "$bad_names" ]; then
  echo "금지된 파일이 추적 중입니다:"
  echo "$bad_names"
  fail=1
fi

echo "[guard] 비밀 패턴 검사"
# 서비스 계정 JSON, PEM 개인 키, Anthropic 키. (Firebase 웹 apiKey는 공개 값이라 검사 대상이 아님)
hits=$(git grep -I -l -E '"private_key"|BEGIN (RSA |EC )?PRIVATE KEY|sk-ant-[A-Za-z0-9_-]{10,}' -- . \
  ':(exclude)tools/guard.sh' ':(exclude)tools/test' ':(exclude)README.md' || true)
if [ -n "$hits" ]; then
  echo "비밀 값으로 보이는 패턴이 발견되었습니다:"
  echo "$hits"
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "[guard] 실패: 위 파일을 커밋에서 제거하고, 노출됐다면 키를 즉시 폐기·재발급하세요."
  exit 1
fi
echo "[guard] 통과"
