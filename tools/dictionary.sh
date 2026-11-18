#!/usr/bin/env bash
set -euo pipefail

output="${1:?expected destination}"
install -d "$(dirname "$output")"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
url="$(jq -er .url data/dictionary.lock.json)"
member="$(jq -er .member data/dictionary.lock.json)"
archive_bytes="$(jq -er .bytes data/dictionary.lock.json)"

[[ "$url" =~ ^https://d2ej7fkh96fzlu\.cloudfront\.net/sudachidict/v1/sudachi-dictionary-[0-9]{8}-core\.zip$ ]]
[[ "$member" =~ ^sudachi-dictionary-[0-9]{8}/system_core\.dic$ ]]
check_file() {
  local file="$1" bytes="$2" expected="$3" derived
  [[ "$(wc -c < "$file" | tr -d ' ')" == "$bytes" ]]
  derived="$(shasum -a 256 "$file")"
  [[ "${derived%% *}" == "$expected" ]]
}
system_bytes="$(jq -er .systemBytes data/dictionary.lock.json)"
system_sha="$(jq -er .systemSha256 data/dictionary.lock.json)"
if [[ -f "$output" ]] && check_file "$output" "$system_bytes" "$system_sha"; then
  exit 0
fi

curl --proto '=https' --fail --silent --show-error --retry 2 --max-time 180 --max-filesize "$archive_bytes" -o "$work/system.zip" "$url"
check_file "$work/system.zip" "$archive_bytes" "$(jq -er .sha256 data/dictionary.lock.json)"
unzip -p "$work/system.zip" "$member" > "$work/system.dic"
check_file "$work/system.dic" "$system_bytes" "$system_sha"
mv "$work/system.dic" "$output"
