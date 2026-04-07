"""
PDF ページ読取可否 複数バージョン判定スクリプト

使用モデル: claude-haiku-4-5-20251001
判定基準:   prompt.txt（c3 を VERSION 1～15 で試す）
出力:       results.csv（c1,c2,c4 + v1_c3～v15_c3 + v1_readable～v15_readable）

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
DPI         = 100
SLEEP_SEC   = 0.3

# c3 のバージョン（VERSION 1～15）
C3_VERSIONS = [
    ("v1", "速書き・続け書き・省略が目立つ場合はno"),
    ("v2", "読めない行が全体の10%を超える場合はno"),
    ("v3", "読めない行が全体の15%を超える場合はno"),
    ("v4", "読めない行が全体の20%を超える場合はno"),
    ("v5", "速書き・続け書き・省略が全体的に著しく目立ち、文字が追えない場合のみno"),
    ("v6", "読める文字が全体の80%以上ならyes"),
    ("v7", "読める文字が全体の75%以上ならyes"),
    ("v8", "読める文字が全体の70%以上ならyes"),
    ("v9", "読める文字が全体の85%以上ならyes"),
    ("v10", "読める文字が全体の90%以上ならyes"),
    ("v11", "答えや計算過程が明確に読める場合はyes"),
    ("v12", "説明部分が50%以上読める場合はyes"),
    ("v13", "説明部分が70%以上読める場合はyes"),
    ("v14", "答え100%読める AND 全体で読めない行が15%以下ならyes"),
    ("v15", "速書き・続け書きが全体の20%未満なら yes"),
]


# ── プロンプト読み込み・加工 ───────────────────────
def load_base_prompt() -> str:
    """プロンプトの共通部分を読み込む"""
    if not PROMPT_FILE.exists():
        raise FileNotFoundError(f'{PROMPT_FILE} が見つかりません')
    lines = PROMPT_FILE.read_text(encoding='utf-8').splitlines()
    # c3 以降の詳細定義は除外
    text = '\n'.join(
        line for line in lines
        if not line.lstrip().startswith('#') and '=========' not in line and 'VERSION' not in line
    ).strip()
    return text


def build_prompt_for_version(base_prompt: str, version_name: str, version_desc: str) -> str:
    """特定バージョンのプロンプトを構築"""
    # c3 の定義だけを置き換える
    prompt = base_prompt.replace(
        "3. 個々の文字が文字として追える",
        f"3. 個々の文字が文字として追える（{version_desc}）"
    )
    return prompt


# ── ファイル選択ダイアログ ────────────────────────
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


# ── PDF 1ページ → PNG base64 ──────────────────────
def page_to_png_base64(page: fitz.Page) -> str:
    mat = fitz.Matrix(DPI / 72, DPI / 72)
    pix = page.get_pixmap(matrix=mat)
    return base64.standard_b64encode(pix.tobytes('png')).decode()


# ── 1ページ判定 ───────────────────────────────────
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


# ── メイン ────────────────────────────────────────
def main():
    base_prompt = load_base_prompt()

    env_path = Path.home() / '.env_claude'
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith('CLAUDE_API_KEY='):
                os.environ['CLAUDE_API_KEY'] = line.split('=', 1)[1].strip()

    api_key = os.environ.get('CLAUDE_API_KEY')
    if not api_key:
        raise EnvironmentError('CLAUDE_API_KEY が未設定です')
    client = anthropic.Anthropic(api_key=api_key)

    pdf_files = select_files()
    if not pdf_files:
        print('ファイルが選択されませんでした')
        return
    print(f'\n{len(pdf_files)} ファイルを処理します')

    RESULTS_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    output_csv = RESULTS_DIR / f'results_multiversion_{timestamp}.csv'

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

                # 最初に c1, c2, c4 を評価（VERSION 1 で）
                prompt_v1 = build_prompt_for_version(base_prompt, "v1", C3_VERSIONS[0][1])
                result_v1 = judge_page(client, prompt_v1, png_base64)
                c1 = result_v1.get('c1', 'error')
                c2 = result_v1.get('c2', 'error')
                c4 = result_v1.get('c4', 'error')

                # 各バージョンで c3 を評価
                row = {
                    'file': pdf_path.name,
                    'page': page_num,
                    'c1': c1,
                    'c2': c2,
                    'c4': c4,
                }

                for version_name, version_desc in C3_VERSIONS:
                    prompt = build_prompt_for_version(base_prompt, version_name, version_desc)
                    result = judge_page(client, prompt, png_base64)
                    c3 = result.get('c3', 'error')
                    reason = result.get('reason', '')

                    row[f'{version_name}_c3'] = c3
                    row[f'{version_name}_reason'] = reason
                    time.sleep(SLEEP_SEC)

                rows.append(row)
                print(f"完了")

            except Exception as e:
                print(f'エラー: {e}')
                row = {'file': pdf_path.name, 'page': page_num, 'c1': 'error', 'c2': 'error', 'c4': 'error'}
                for version_name, _ in C3_VERSIONS:
                    row[f'{version_name}_c3'] = 'error'
                    row[f'{version_name}_reason'] = str(e)
                rows.append(row)

        doc.close()

    # CSV 出力
    fieldnames = ['file', 'page', 'c1', 'c2', 'c4']
    for version_name, _ in C3_VERSIONS:
        fieldnames.append(f'{version_name}_c3')
        fieldnames.append(f'{version_name}_reason')

    with open(output_csv, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f'\n完了: {len(rows)}ページ処理')
    print(f'結果: {output_csv}')


if __name__ == '__main__':
    main()
