import fitz
import os
from pathlib import Path

INPUT_DIR = Path("original")
OUTPUT_DIR = Path("redacted")
OUTPUT_DIR.mkdir(exist_ok=True)

# 奇数ページの右上にある名前欄の座標（ポイント単位）
NAME_RECT = fitz.Rect(245, 65, 512, 95)

for pdf_path in INPUT_DIR.glob("*.pdf"):
    doc = fitz.open(pdf_path)
    print(f"処理中: {pdf_path.name} ({len(doc)}ページ)")

    for i, page in enumerate(doc):
        page_num = i + 1
        if page_num % 2 == 1:  # 奇数ページのみ
            page.add_redact_annot(NAME_RECT, fill=(0, 0, 0))
            page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_PIXELS)

    output_path = OUTPUT_DIR / pdf_path.name
    doc.save(output_path)
    doc.close()
    print(f"  → 保存完了: {output_path}")

print("完了")
