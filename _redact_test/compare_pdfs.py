"""
PDF 読取可否判定 比較スクリプト（2つのPDF用）

使用モデル: claude-haiku-4-5-20251001
判定基準:   prompt.txt
出力:       results/results_compare.csv
"""

import os
import csv
import base64
import time
import json
import re
from datetime import datetime
from pathlib import Path
import fitz  # PyMuPDF
import anthropic

# ── 設定 ──────────────────────────────────────────────
MODEL       = 'claude-haiku-4-5-20251001'
PROMPT_FILE = Path(__file__).parent / 'prompt.txt'
RESULTS_DIR = Path(__file__).parent / 'results'
DPI         = 100
SLEEP_SEC   = 0.3

# 比較対象のPDF
PDF_2E = Path(__file__).parent / 'redacted/サンプル_2E/第20回2E 6.pdf'
PDF_2J = Path(__file__).parent / 'redacted/サンプル_2J/2J 6.pdf'


# ── プロンプト読み込み ─────────────────────────────────
def load_prompt() -> str:
    if not PROMPT_FILE.exists():
        raise FileNotFoundError(f'{PROMPT_FILE} が見つかりません')
    lines = PROMPT_FILE.read_text(encoding='utf-8').splitlines()
    # コメント行（#で始まる行）を除外
    text = '\n'.join(line for line in lines if not line.lstrip().startswith('#')).strip()
    return text


# ── PDF 1ページ → PNG base64 ──────────────────────────
def page_to_png_base64(page: fitz.Page) -> str:
    mat = fitz.Matrix(DPI / 72, DPI / 72)
    pix = page.get_pixmap(matrix=mat)
    return base64.standard_b64encode(pix.tobytes('png')).decode()


# ── 1ページ判定 ───────────────────────────────────────
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


# ── メイン ────────────────────────────────────────────
def main():
    prompt = load_prompt()

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

    # 対象PDFs確認
    pdfs = [
        (PDF_2E, '2E'),
        (PDF_2J, '2J')
    ]

    for pdf_path, label in pdfs:
        if not pdf_path.exists():
            print(f'✗ {label}: {pdf_path} が見つかりません')
            return

    # 出力準備
    RESULTS_DIR.mkdir(exist_ok=True)
    output_csv = RESULTS_DIR / 'results_compare.csv'

    rows = []

    # 各PDFを処理
    for pdf_path, label in pdfs:
        doc = fitz.open(pdf_path)
        total = len(doc)
        print(f'\n[{label}] {pdf_path.name}（{total}ページ）')

        for i, page in enumerate(doc):
            page_num = i + 1
            print(f'  ページ {page_num}/{total} ...', end=' ', flush=True)

            try:
                png_base64 = page_to_png_base64(page)
                result     = judge_page(client, prompt, png_base64)
                readable   = result.get('readable', 'error')
                reason     = result.get('reason', '')
                c1 = result.get('c1', '')
                c2 = result.get('c2', '')
                c3 = result.get('c3', '')
                c4 = result.get('c4', '')
                print(f"{readable}  (c1={c1} c2={c2} c3={c3} c4={c4})")
            except Exception as e:
                readable, reason = 'error', str(e)
                c1 = c2 = c3 = c4 = ''
                print(f'エラー: {e}')

            rows.append({
                'class': label,
                'file':     pdf_path.name,
                'page':     page_num,
                'readable': readable,
                'c1': c1, 'c2': c2, 'c3': c3, 'c4': c4,
                'reason':   reason
            })
            time.sleep(SLEEP_SEC)

        doc.close()

    # CSV 出力
    with open(output_csv, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=['class', 'file', 'page', 'readable', 'c1', 'c2', 'c3', 'c4', 'reason'])
        writer.writeheader()
        writer.writerows(rows)

    yes   = sum(1 for r in rows if r['readable'] == 'yes')
    no    = sum(1 for r in rows if r['readable'] == 'no')
    error = sum(1 for r in rows if r['readable'] == 'error')
    print(f'\n完了: {len(rows)}ページ処理（yes={yes} / no={no} / error={error}）')
    print(f'結果: {output_csv}')


if __name__ == '__main__':
    main()
