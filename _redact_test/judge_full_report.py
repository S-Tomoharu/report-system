"""
レポート全体の読取可否判定スクリプト

使用モデル: claude-haiku-4-5-20251001
判定基準:   prompt_overall.txt（起動時に読み込む）
出力:       results_overall_YYYYMMDD_HHMMSS.csv（ファイル名・readable・reason）

実行前に環境変数を設定すること:
  export CLAUDE_API_KEY=sk-ant-...

【judge_readable.py との違い】
- judge_readable.py: 各ページを個別評価（複数ページ → 複数行出力）
- judge_full_report.py: PDF 全体を1回で評価（複数ページ → 1行出力）
"""

import os
import csv
import base64
import json
import re
from datetime import datetime
from pathlib import Path
import tkinter as tk
from tkinter import filedialog
import anthropic

# ── 設定 ──────────────────────────────────────────────
MODEL       = 'claude-haiku-4-5-20251001'
PROMPT_FILE = Path(__file__).parent / 'prompt_overall.txt'
RESULTS_DIR = Path(__file__).parent / 'results'


# ── プロンプト読み込み ─────────────────────────────────
def load_prompt() -> str:
    if not PROMPT_FILE.exists():
        raise FileNotFoundError(f'{PROMPT_FILE} が見つかりません')
    text = PROMPT_FILE.read_text(encoding='utf-8')
    print(f'プロンプト読み込み: {PROMPT_FILE}')
    return text


# ── ファイル選択ダイアログ ────────────────────────────
def select_files() -> list[Path]:
    root = tk.Tk()
    root.withdraw()
    root.call('wm', 'attributes', '.', '-topmost', True)
    paths = filedialog.askopenfilenames(
        title='評価するPDFを選択（複数選択可）',
        filetypes=[('PDF', '*.pdf')]
    )
    root.destroy()
    return [Path(p) for p in paths]


# ── PDF を Base64 に変換 ───────────────────────────────
def pdf_to_base64(pdf_path: Path) -> str:
    with open(pdf_path, 'rb') as f:
        return base64.standard_b64encode(f.read()).decode()


# ── 1ファイル判定（PDF全体） ──────────────────────────
def judge_report(client: anthropic.Anthropic, prompt: str, pdf_base64: str) -> dict:
    """PDF全体をClaude APIで判定"""
    response = client.messages.create(
        model=MODEL,
        max_tokens=256,
        temperature=0,
        messages=[{
            'role': 'user',
            'content': [
                {
                    'type': 'document',
                    'source': {
                        'type': 'base64',
                        'media_type': 'application/pdf',
                        'data': pdf_base64
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
    output_csv = RESULTS_DIR / f'results_overall_{timestamp}.csv'

    rows = []
    for pdf_path in pdf_files:
        print(f'\n{pdf_path.name} ...', end=' ', flush=True)

        try:
            pdf_base64 = pdf_to_base64(pdf_path)
            result     = judge_report(client, prompt, pdf_base64)
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
            'readable': readable,
            'c1': c1, 'c2': c2, 'c3': c3, 'c4': c4,
            'reason':   reason
        })

    with open(output_csv, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=['file', 'readable', 'c1', 'c2', 'c3', 'c4', 'reason'])
        writer.writeheader()
        writer.writerows(rows)

    yes   = sum(1 for r in rows if r['readable'] == 'yes')
    no    = sum(1 for r in rows if r['readable'] == 'no')
    error = sum(1 for r in rows if r['readable'] == 'error')
    print(f'\n完了: {len(rows)}ファイル処理（yes={yes} / no={no} / error={error}）')
    print(f'結果: {output_csv}')


if __name__ == '__main__':
    main()
