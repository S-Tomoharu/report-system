import os
import csv
import base64
import time
from pathlib import Path
import fitz
from google import genai
from google.genai import types

# APIキー読み込み
env_path = Path.home() / ".env_gemini"
for line in env_path.read_text().splitlines():
    if line.startswith("GEMINI_API_KEY="):
        os.environ["GEMINI_API_KEY"] = line.split("=", 1)[1].strip()

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
MODEL = "gemini-2.5-flash"

REDACTED_DIR = Path("redacted")
OUTPUT_CSV = Path("results.csv")

PROMPT = """以下の画像は生徒が提出した手書きレポートの1ページです。

あなたはOCRシステムです。このレポートをテキスト化しようとしています。
次の場合、処理を中断してください。

【処理中断（ng）の条件】
- 文字の線が薄すぎて判別できない
- ピンぼけや暗さで輪郭が潰れている
- 解答欄の大半が空白である（マス目状の罫線や点線の枠は装飾のためカウントしない）
- 続け書きや省略が全体の3割以上の文字に見られる
- 全体的に急いで書かれており、文字の形が安定していない

以下のJSON形式のみで回答してください。
{"result": "ok" または "ng", "reason": "判定理由を一文で"}"""


def page_to_png_bytes(page: fitz.Page, dpi: int = 200) -> bytes:
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat)
    return pix.tobytes("png")


def judge_page(png_bytes: bytes) -> dict:
    response = client.models.generate_content(
        model=MODEL,
        contents=[
            types.Part.from_bytes(data=png_bytes, mime_type="image/png"),
            PROMPT,
        ],
        config=types.GenerateContentConfig(temperature=0),
    )
    import json, re
    text = response.text.strip()
    # JSONブロックを抽出
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        result = json.loads(m.group())
        if not result.get("reason"):
            print(f"\n[WARN] reasonが空 - 生レスポンス: {text}")
        return result
    raise ValueError(f"JSON解析失敗: {text}")


def main():
    rows = []
    pdf_files = sorted(REDACTED_DIR.glob("*.pdf"))

    for pdf_path in pdf_files:
        doc = fitz.open(pdf_path)
        total = len(doc)
        print(f"\n{pdf_path.name} ({total}ページ)")

        for i, page in enumerate(doc):
            page_num = i + 1
            print(f"  ページ {page_num}/{total} ...", end=" ", flush=True)

            png_bytes = page_to_png_bytes(page)
            try:
                result = judge_page(png_bytes)
                ocr_result = result.get("result", "")
                reason = result.get("reason", "")
                print(f"結果: {ocr_result}")
            except Exception as e:
                ocr_result, reason = "error", str(e)
                print(f"エラー: {e}")

            rows.append({
                "file": pdf_path.name,
                "page": page_num,
                "result": ocr_result,
                "reason": reason,
            })

            time.sleep(0.5)  # レート制限対策

        doc.close()

    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=["file", "page", "result", "reason"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"\n結果を {OUTPUT_CSV} に保存しました（{len(rows)}行）")


if __name__ == "__main__":
    main()
