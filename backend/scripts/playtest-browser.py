import json
import re
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[2] / "uploads/playtest-20261118"
secret = json.loads((root / "private.json").read_text())
output = root / "ui"
output.mkdir(exist_ok=True)
binary = "C:/Users/TBC/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe"
routes = ["map", "lab", "breed", "arena", "expeditions", "raid", "training", "relics", "oracle", "quests", "market", "raffle", "depths", "hall", "lore", "guide", "fairness", "verify", "journal", "economy"]
results = []

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=binary, args=["--disable-gpu"])
    try:
        for index, player in enumerate(secret["players"]):
            started = time.time()
            context = browser.new_context(
                viewport={"width": [320, 360, 390, 430][index % 4], "height": 844},
                record_video_dir=str(output / "video") if index == 0 else None,
            )
            name, value = player["cookie"].split("=", 1)
            context.add_cookies([{"name": name, "value": value, "domain": "ashenkin.xyz", "path": "/", "httpOnly": True, "secure": True, "sameSite": "Lax"}])
            page = context.new_page()
            errors = []
            writes = []
            page.on("pageerror", lambda error: errors.append(str(error)[:250]))
            page.on("request", lambda request: writes.append(request.url) if request.method == "POST" and any(part in request.url for part in ["/transactions", "/starter", "/lab-key", "/wallet/"]) else None)
            result = {"player": index + 1, "viewport": page.viewport_size}
            try:
                page.goto("https://ashenkin.xyz/#/arena/trial/start", wait_until="domcontentloaded")
                page.get_by_role("button", name="Fight three rounds", exact=True).wait_for(timeout=60000)
                for round_number, move in [(1, "Strike"), (2, "Guard"), (3, "Feint")]:
                    page.get_by_role("button", name=f"Round {round_number}: {move}", exact=True).click()
                page.get_by_role("button", name="Fight three rounds", exact=True).click()
                if index == 0:
                    page.wait_for_timeout(1000)
                    page.screenshot(path=str(output / "practice-animation-a.png"))
                    page.wait_for_timeout(1000)
                    page.screenshot(path=str(output / "practice-animation-b.png"))
                page.get_by_role("link", name="Investigate the beacon", exact=True).wait_for(timeout=20000)
                result["practice"] = "passed"
                page.get_by_role("link", name="Investigate the beacon", exact=True).click()
                page.get_by_role("button", name=re.compile("^Follow the tracks")).wait_for(timeout=30000)
                page.get_by_role("button", name=re.compile("^Follow the tracks")).click()
                pawprints = page.get_by_role("button", name=re.compile("Follow the pawprints"))
                relay = page.get_by_role("button", name="Tracks", exact=True)
                pawprints.or_(relay).first.wait_for(timeout=30000)
                if pawprints.count():
                    pawprints.click()
                    page.get_by_role("button", name=re.compile("Climb to the ridge")).click()
                    result["fieldEvidence"] = "browser scouting"
                else:
                    result["fieldEvidence"] = "returned Sepolia expedition"
                for label in ["Tracks", "Lantern", "Crest"]:
                    page.get_by_role("button", name=label, exact=True).click()
                page.get_by_role("button", name=re.compile("Guide the scouts")).click()
                page.get_by_role("heading", name="Light for the road", exact=True).wait_for()
                result["beacon"] = "passed"
                result["noWalletPrompt"] = page.evaluate("typeof window.ethereum === 'undefined'")
                result["unexpectedSigningOrTxRequests"] = len(writes)
                result["overflow"] = page.evaluate("document.documentElement.scrollWidth > window.innerWidth")
                if index == 0:
                    page.screenshot(path=str(output / "beacon-complete.png"), full_page=True)
                result["pages"] = []
                for route in routes[index * 2 : (index + 1) * 2]:
                    page.goto("https://ashenkin.xyz/#/" + route, wait_until="domcontentloaded")
                    page.locator("h1").first.wait_for(timeout=20000)
                    result["pages"].append({"route": route, "overflow": page.evaluate("document.documentElement.scrollWidth > window.innerWidth")})
                result["pageErrors"] = errors
                result["status"] = "passed"
            except Exception as error:
                result["status"] = "failed"
                result["error"] = str(error)[:600]
                page.screenshot(path=str(output / f"player-{index + 1}-failure.png"), full_page=True)
            finally:
                result["elapsedSeconds"] = round(time.time() - started, 2)
                results.append(result)
                (output / "report.json").write_text(json.dumps(results, indent=2))
                print(json.dumps(result), flush=True)
                context.close()
    finally:
        browser.close()
