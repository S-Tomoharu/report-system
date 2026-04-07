"""
PDFページをPNG画像として書き出し、Claude Codeに並列バッチ判定を依頼するスクリプト

使い方:
  python extract_pages.py
  → ファイル選択ダイアログが開く（複数選択可）
  → tmp_pages/ にページごとのPNGを書き出す
  → BATCH_SIZE ページずつ並列で Claude Code が判定
  → results/ にタイムスタンプ付きCSV（Excel対応）を書き出す
"""

import csv
import subprocess
import threading
import time
from datetime import datetime
from pathlib import Path

import fitz  # PyMuPDF
import tkinter as tk
from tkinter import filedialog

TMP_DIR     = Path(__file__).parent / "tmp_pages"
MANIFEST    = Path(__file__).parent / "manifest.txt"
RESULTS_DIR = Path(__file__).parent / "results"
DPI         = 100
BATCH_SIZE  = 10  # 並列実行する場合の1バッチあたりのページ数


def select_files() -> list[Path]:
    root = tk.Tk()
    root.withdraw()
    root.call("wm", "attributes", ".", "-topmost", True)
    paths = filedialog.askopenfilenames(
        title="判定するPDFを選択（複数選択可）",
        filetypes=[("PDF", "*.pdf")],
    )
    root.destroy()
    return [Path(p) for p in paths]


def extract_pages(pdf_files: list[Path]) -> list[tuple[str, int, Path]]:
    """PDFをPNG書き出し。(file名, page番号, png_path) のリストを返す"""
    TMP_DIR.mkdir(exist_ok=True)
    for f in TMP_DIR.glob("*.png"):
        f.unlink()

    entries = []
    for pdf_path in pdf_files:
        doc = fitz.open(pdf_path)
        print(f"{pdf_path.name}（{len(doc)}ページ）")
        for i, page in enumerate(doc):
            page_num = i + 1
            print(f"  書き出し中 {page_num}/{len(doc)} ...", end="\r", flush=True)
            mat = fitz.Matrix(DPI / 72, DPI / 72)
            pix = page.get_pixmap(matrix=mat)
            stem = pdf_path.stem.replace(" ", "_")
            img_name = f"{stem}_p{page_num:03d}.png"
            img_path = TMP_DIR / img_name
            pix.save(str(img_path))
            entries.append((pdf_path.name, page_num, img_path))
        doc.close()
        print()
    return entries


def make_batch_prompt(entries: list[tuple[str, int, Path]], batch_id: int, out_csv: Path) -> str:
    lines = "\n".join(f"{fname}\t{pnum}\t{img}" for fname, pnum, img in entries)
    return (
        f"以下の作業をしてください。PythonスクリプトやAPIキーは一切使わず、"
        f"あなた自身がReadツールで画像を直接読んで判定してください。\n\n"
        f"1. prompt.txt を読んで判定基準を把握する\n"
        f"2. 以下のページ一覧の各行について、画像パスをReadツールで読み、"
        f"prompt.txtの基準でreadable(yes/no)を判定する\n"
        f"3. 結果を {out_csv} に書き出す（列: file,page,readable,c1,c2,c3,c4,reason）\n\n"
        f"ページ一覧:\n{lines}"
    )


def run_batch(entries: list[tuple[str, int, Path]], batch_id: int,
              out_csv: Path, cwd: str, results: dict):
    prompt = make_batch_prompt(entries, batch_id, out_csv)
    proc = subprocess.run(
        ["claude", "--dangerously-skip-permissions", "-p", prompt],
        cwd=cwd,
    )
    results[batch_id] = proc.returncode


def merge_csvs(batch_csvs: list[Path], out_csv: Path):
    """バッチCSVをpage順にマージしてExcel対応CSVに書き出す"""
    rows = []
    for csv_path in batch_csvs:
        if not csv_path.exists():
            print(f"  [警告] {csv_path.name} が見つかりません")
            continue
        with open(csv_path, encoding="utf-8-sig", errors="replace") as f:
            reader = csv.DictReader(f)
            for row in reader:
                rows.append(row)
        csv_path.unlink()  # 一時ファイル削除

    rows.sort(key=lambda r: (r["file"], int(r["page"])))

    with open(out_csv, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=["file", "page", "readable", "c1", "c2", "c3", "c4", "reason"])
        writer.writeheader()
        writer.writerows(rows)


def main():
    pdf_files = select_files()
    if not pdf_files:
        print("ファイルが選択されませんでした")
        return

    entries = extract_pages(pdf_files)
    total = len(entries)
    print(f"\n{total}ページを {TMP_DIR} に書き出しました")

    # バッチ分割
    batches = [entries[i:i + BATCH_SIZE] for i in range(0, total, BATCH_SIZE)]
    n_batches = len(batches)
    print(f"{BATCH_SIZE}ページ × {n_batches}バッチで並列実行します\n")

    RESULTS_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    final_csv = RESULTS_DIR / f"results_{timestamp}.csv"
    batch_csvs = [RESULTS_DIR / f"_batch_{timestamp}_{i:02d}.csv" for i in range(n_batches)]

    # 並列実行
    threads = []
    batch_results = {}
    start = time.time()

    for i, (batch, out_csv) in enumerate(zip(batches, batch_csvs)):
        t = threading.Thread(
            target=run_batch,
            args=(batch, i, out_csv, str(Path(__file__).parent), batch_results),
            daemon=True,
        )
        threads.append(t)
        t.start()

    # 進捗表示（完了バッチ数をカウント）
    while any(t.is_alive() for t in threads):
        done = sum(1 for t in threads if not t.is_alive())
        elapsed = int(time.time() - start)
        print(f"  判定中... {done}/{n_batches}バッチ完了 ({elapsed}秒経過)", end="\r", flush=True)
        time.sleep(1)

    elapsed = int(time.time() - start)
    print(f"\n全バッチ完了（{elapsed}秒）")

    # マージ
    merge_csvs(batch_csvs, final_csv)
    print(f"結果: {final_csv}")


if __name__ == "__main__":
    main()
