"""
PDF ページ読取可否 一括判定スクリプト

使用モデル: claude-haiku-4-5-20251001
判定基準:   prompt.txt（起動時に読み込む）
出力:       results.csv（ファイル名・ページ番号・readable・reason）

実行前に環境変数を設定すること:
  export CLAUDE_API_KEY=sk-ant-...
"""

import os
import csv
import base64
import time
import json
import re
from datetime import datetime
from pathlib import Path
import tkinter as tk
from tkinter import filedialog
import fitz  # PyMuPDF
import anthropic

# ── 設定 ──────────────────────────────────────────────
MODEL       = 'claude-haiku-4-5-20251001'
PROMPT_FILE = Path(__file__).parent / 'prompt.txt'
RESULTS_DIR = Path(__file__).parent / 'results'
DPI         = 100   # PDF→画像変換の解像度
SLEEP_SEC   = 0.3   # APIレート制限対策


# ── プロンプト読み込み ─────────────────────────────────
def load_prompt() -> str:
    if not PROMPT_FILE.exists():
        raise FileNotFoundError(f'{PROMPT_FILE} が見つかりません')
    text = PROMPT_FILE.read_text(encoding='utf-8')
    print(f'プロンプト読み込み: {PROMPT_FILE}')
    print(f'c3 は VERSION 6（読める文字80%以上）に固定')
    return text


# ── ファイル選択ダイアログ ────────────────────────────
def select_files() -> list[Path]:
    root = tk.Tk()
    root.withdraw()
    root.call('wm', 'attributes', '.', '-topmost', True)
    paths = filedialog.askopenfilenames(
        title='判定するPDFを選択（複数選択可）',
        filetypes=[('PDF', '*.pdf')]
    )
    root.destroy()
    return [Path(p) for p in paths]


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

    env_path = Path.home() / '.env_claude'
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith('CLAUDE_API_KEY='):
                os.environ['CLAUDE_API_KEY'] = line.split('=', 1)[1].strip()

    api_key = os.environ.get('CLAUDE_API_KEY')
    if not api_key:
        raise EnvironmentError('CLAUDE_API_KEY が未設定です（~/.env_claude または環境変数に設定してください）')
    client = anthropic.Anthropic(api_key=api_key)

    pdf_files = select_files()
    if not pdf_files:
        print('ファイルが選択されませんでした')
        return
    print(f'\n{len(pdf_files)} ファイルを処理します')

    RESULTS_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    output_csv = RESULTS_DIR / f'results_{timestamp}.csv'

    rows = []
    for pdf_path in pdf_files:
        doc = fitz.open(pdf_path)
        total = len(doc)
        print(f'\n{pdf_path.name}（{total}ページ）')

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
                'file':     pdf_path.name,
                'page':     page_num,
                'readable': readable,
                'c1': c1, 'c2': c2, 'c3': c3, 'c4': c4,
                'reason':   reason
            })
            time.sleep(SLEEP_SEC)

        doc.close()

    with open(output_csv, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=['file', 'page', 'readable', 'c1', 'c2', 'c3', 'c4', 'reason'])
        writer.writeheader()
        writer.writerows(rows)

    yes   = sum(1 for r in rows if r['readable'] == 'yes')
    no    = sum(1 for r in rows if r['readable'] == 'no')
    error = sum(1 for r in rows if r['readable'] == 'error')
    print(f'\n完了: {len(rows)}ページ処理（yes={yes} / no={no} / error={error}）')
    print(f'結果: {output_csv}')


if __name__ == '__main__':
    main()
