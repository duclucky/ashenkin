import json
import re
import subprocess
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

workspace = Path(__file__).resolve().parents[2]
output = workspace / "uploads/playtest-20261118/ui"
binary = "C:/Users/TBC/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe"
calls = []
transactions = []
index = 3
signer_code = """
const fs=require('node:fs'),{privateKeyToAccount}=require('viem/accounts');
const input=JSON.parse(fs.readFileSync(0,'utf8'));
const saved=JSON.parse(fs.readFileSync('../uploads/playtest-20261118/private.json','utf8'));
const account=privateKeyToAccount(saved.players[input.index].pk);
if(input.method==='address')process.stdout.write(account.address);
else {
 const text=Buffer.from(input.message.slice(2),'hex').toString('utf8');
 if(!text.startsWith('ashenkin.xyz wants you to sign in with your Ethereum account:'))throw Error('Unexpected signing request');
 account.signMessage({message:{raw:input.message}}).then(signature=>process.stdout.write(signature));
}
"""

def signer(method, message=None):
    result = subprocess.run(
        ["node", "-e", signer_code], cwd=workspace / "backend",
        input=json.dumps({"index": index, "method": method, "message": message}),
        text=True, capture_output=True, check=True,
    )
    return result.stdout

identity = signer("address")

def wallet_request(method, params):
    calls.append(method)
    if method in ["eth_requestAccounts", "eth_accounts"]:
        return [identity]
    if method == "eth_chainId":
        return "0xaa36a7"
    if method == "personal_sign":
        return signer("sign", params[0])
    raise RuntimeError("Unexpected external wallet request " + method)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=binary, args=["--disable-gpu"])
    context = browser.new_context(viewport={"width": 390, "height": 844}, record_video_dir=str(output / "video"))
    page = context.new_page()
    page.expose_function("auditWalletRequest", wallet_request)
    page.add_init_script("window.ethereum = {request: ({method,params}) => window.auditWalletRequest(method,params)}")
    page.on("response", lambda response: transactions.append(response) if "/api/keeper/transactions" in response.url and response.request.method == "POST" else None)
    try:
        page.goto("https://ashenkin.xyz/#/lab", wait_until="domcontentloaded")
        page.get_by_role("button", name="Sign in with wallet", exact=True).click(timeout=20000)
        page.get_by_role("button", name=re.compile("^Hatch embryo")).wait_for(timeout=30000)
        assert calls == ["eth_requestAccounts", "personal_sign"], calls
        page.goto("https://ashenkin.xyz/#/lab", wait_until="domcontentloaded")
        action = page.get_by_role("button", name=re.compile("^Hatch embryo"))
        action.wait_for(timeout=30000)
        action.click()
        page.get_by_role("dialog", name="Hatch embryo", exact=True).wait_for(timeout=20000)
        page.wait_for_timeout(800)
        page.screenshot(path=str(output / "hatch-animation-a.png"))
        page.wait_for_timeout(800)
        page.screenshot(path=str(output / "hatch-animation-b.png"))
        page.locator('.chm-hatch-focus[data-beat="2"]').wait_for(timeout=120000)
        assert calls == ["eth_requestAccounts", "personal_sign"], calls
        assert len(transactions) == 1
        page.screenshot(path=str(output / "signed-login-circle-reward.png"), full_page=True)
        page.keyboard.press("Escape")
        page.get_by_text("Read your sealed genes", exact=False).first.click()
        page.get_by_role("button", name="Unlock lab key", exact=True).click()
        page.get_by_text("Lab key unlocked", exact=True).wait_for(timeout=90000)
        assert calls == ["eth_requestAccounts", "personal_sign"], calls
        request_id = transactions[0].json()["id"]
        record = {"player": index + 1, "requestId": request_id, "circleLabKeySigned": True, "status": "passed", "externalWalletCalls": calls, "circleTransactionSubmissions": len(transactions), "flow": "wallet UI login -> animated NFT hatch -> Circle Lab key without another wallet signature"}
        (output / "signing.json").write_text(json.dumps(record, indent=2))
        print(json.dumps(record), flush=True)
    finally:
        context.close()
        browser.close()
