#!/usr/bin/env python3
import asyncio
import base64
import csv
import json
import os
from datetime import datetime
from pathlib import Path

import anthropic

BASE_DIR = Path(__file__).parent
MANIFEST_PATH = BASE_DIR / "manifest.txt"
PROMPT_PATH = BASE_DIR / "prompt.txt"
RESULTS_DIR = BASE_DIR / "results"


def read_manifest():
    entries = []
    with open(MANIFEST_PATH, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split("\t")
            if len(parts) == 3:
                pdf_name, page_num, img_path = parts
                entries.append((pdf_name, int(page_num), img_path))
    return entries


def read_prompt():
    return PROMPT_PATH.read_text(encoding="utf-8")


async def judge_page(client, prompt, pdf_name, page_num, img_path, semaphore):
    async with semaphore:
        with open(img_path, "rb") as f:
            img_data = base64.standard_b64encode(f.read()).decode("utf-8")

        response = await client.messages.create(
            model="claude-opus-4-6",
            max_tokens=256,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/png",
                                "data": img_data,
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        )

        text = next(b.text for b in response.content if b.type == "text")
        # Strip markdown code fences if present
        text = text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        result = json.loads(text)
        print(f"  p{page_num:03d}: {result['readable']} — {result['reason'][:40]}")
        return pdf_name, page_num, result["readable"], result["reason"]


async def main():
    entries = read_manifest()
    prompt = read_prompt()
    print(f"Processing {len(entries)} pages...")

    client = anthropic.AsyncAnthropic()
    semaphore = asyncio.Semaphore(8)  # 8 concurrent requests

    tasks = [
        judge_page(client, prompt, pdf_name, page_num, img_path, semaphore)
        for pdf_name, page_num, img_path in entries
    ]

    results = await asyncio.gather(*tasks)
    results = sorted(results, key=lambda x: x[1])

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = RESULTS_DIR / f"results_{timestamp}.csv"

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["file", "page", "readable", "reason"])
        for pdf_name, page_num, readable, reason in results:
            writer.writerow([pdf_name, page_num, readable, reason])

    print(f"\nDone! Written to {output_path}")
    yes_count = sum(1 for r in results if r[2] == "yes")
    print(f"Results: {yes_count} yes / {len(results) - yes_count} no")


asyncio.run(main())
