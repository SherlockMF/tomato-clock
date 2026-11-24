"""Observe one real 25-minute session in an isolated Chrome context, against a running Studio."""
import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

def timestamp():
    return datetime.now(timezone.utc).isoformat()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("evidence", type=Path)
    args = parser.parse_args()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome")
        context = browser.new_context()
        page = context.new_page()
        page.goto(args.url)
        page.select_option("#mbti", "ISTJ")
        page.select_option("#gender", "女")
        start = time.monotonic()
        started = timestamp()
        page.locator("#begin").click()
        expect(page.locator("#timer")).to_be_visible()
        print("START", started, page.locator("#timer").inner_text(), flush=True)
        page.reload()
        expect(page.locator("#focus")).to_be_visible()
        page.locator("#history").click()
        expect(page.locator("#archive-empty")).to_be_visible()
        # Wait for the real browser to persist the completion and load the matching receipt.
        expect(page.locator("#prose .body").first).to_be_visible(timeout=26*60*1000)
        elapsed = time.monotonic() - start
        assert elapsed >= 1500
        expect(page.locator("#reading-title")).to_have_text("第 1 次专注")
        first = page.locator("#prose .body").first.inner_text()
        page.reload()
        expect(page.locator("#prose .body").first).to_have_text(first)
        page.locator("#history").click()
        expect(page.locator("#entries li")).to_have_count(1)
        result = dict(startedAt=started, observedAt=timestamp(), elapsedSeconds=round(elapsed,2),
                      realMinutes=25, type="ISTJ", unlockedAfterReload=1, firstStory=first)
        args.evidence.parent.mkdir(parents=True,exist_ok=True)
        args.evidence.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
        print(json.dumps(result,ensure_ascii=False), flush=True)
        browser.close()

if __name__ == "__main__":
    main()
