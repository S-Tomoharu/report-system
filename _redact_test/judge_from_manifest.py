"""
manifest.txt に基づく PDF ページ読取可否 一括判定スクリプト

使用モデル: claude-haiku-4-5-20251001
判定基準:   prompt.txt
入力:       manifest.txt（ファイル名・ページ番号・PNG パスのタブ区切り）
出力:       results/results_YYYYMMDD_HHMMSS.csv
"""

import os
import csv
import base64
import time
import json
import re
from datetime import datetime
from pathlib import Path
import anthropic

# ── 設定 ──────────────────────────────────────────────
MODEL        = 'claude-haiku-4-5-20251001'
BASE_DIR     = Path(__file__).parent
PROMPT_FILE  = BASE_DIR / 'prompt.txt'
MANIFEST     = BASE_DIR / 'manifest.txt'
RESULTS_DIR  = BASE_DIR / 'results'
SLEEP_SEC    = 0.3


def load_prompt() -> str:
    return PROMPT_FILE.read_text(encoding='utf-8').strip()


def load_manifest() -> list[tuple[str, int, Path]]:
    rows = []
    for line in MANIFEST.read_text(encoding='utf-8').splitlines():
        parts = line.strip().split('\t')
        if len(parts) < 3:
            continue
        pdf_name, page_num, png_path = parts[0], int(parts[1]), Path(parts[2])
        rows.append((pdf_name, page_num, png_path))
    return rows


def png_to_base64(png_path: Path) -> str:
    return base64.standard_b64encode(png_path.read_bytes()).decode()


def judge_page(client: anthropic.Anthropic, prompt: str, png_base64: str) -> dict:
    response = client.messages.create(
        model=MODEL,
        max_tokens=256,
        temperature=0,
        messages=[{
            'role': 'user',
            'content': [
                {
                    'type': 'image',
                    'source': {
                        'type': 'base64',
                        'media_type': 'image/png',
                        'data': png_base64
                    }
                },
                {'type': 'text', 'text': prompt}
            ]
        }]
    )
    text = response.content[0].text.strip()
    m = re.search(r'\{.*\}', text, re.DOTALL)
    if m:
        return json.loads(m.group())
    raise ValueError(f'JSON解析失敗: {text}')


def main():
    # API キー読み込み
    env_path = Path.home() / '.env_claude'
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith('CLAUDE_API_KEY='):
                os.environ['CLAUDE_API_KEY'] = line.split('=', 1)[1].strip()

    api_key = os.environ.get('CLAUDE_API_KEY')
    if not api_key:
        raise EnvironmentError('CLAUDE_API_KEY が未設定です')

    client = anthropic.Anthropic(api_key=api_key)
    prompt = load_prompt()
    entries = load_manifest()

    print(f'manifest: {len(entries)} ページ')

    RESULTS_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    output_csv = RESULTS_DIR / f'results_{timestamp}.csv'

    rows = []
    for i, (pdf_name, page_num, png_path) in enumerate(entries, 1):
        print(f'  [{i}/{len(entries)}] {pdf_name} p{page_num} ...', end=' ', flush=True)

        if not png_path.exists():
            readable, reason = 'error', f'ファイルが見つかりません: {png_path}'
            print(f'エラー: {reason}')
        else:
            try:
                png_base64 = png_to_base64(png_path)
                result     = judge_page(client, prompt, png_base64)
                readable   = result.get('readable', 'error')
                reason     = result.get('reason', '')
                print(readable)
            except Exception as e:
                readable, reason = 'error', str(e)
                print(f'エラー: {e}')

        rows.append({'file': pdf_name, 'page': page_num, 'readable': readable, 'reason': reason})
        time.sleep(SLEEP_SEC)

    with open(output_csv, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=['file', 'page', 'readable', 'reason'])
        writer.writeheader()
        writer.writerows(rows)

    yes   = sum(1 for r in rows if r['readable'] == 'yes')
    no    = sum(1 for r in rows if r['readable'] == 'no')
    error = sum(1 for r in rows if r['readable'] == 'error')
    print(f'\n完了: {len(rows)} ページ（yes={yes} / no={no} / error={error}）')
    print(f'結果: {output_csv}')


if __name__ == '__main__':
    main()
