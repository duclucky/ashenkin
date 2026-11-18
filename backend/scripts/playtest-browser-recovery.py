import json
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[2] / 'uploads/playtest-20261118'
output = root / 'ui'
player = json.loads((root / 'private.json').read_text())['players'][8]
failed_request = '63f36d2e-e3c6-40d7-86ff-c3bcaeef86a1'
binary = 'C:/Users/TBC/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe'
submissions = []
responses = []
external_calls = []

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=binary, args=['--disable-gpu'])
    context = browser.new_context(viewport={'width': 390, 'height': 844}, record_video_dir=str(output / 'video'))
    name, value = player['cookie'].split('=', 1)
    context.add_cookies([{'name': name, 'value': value, 'domain': 'ashenkin.xyz', 'path': '/', 'httpOnly': True, 'secure': True, 'sameSite': 'Lax'}])
    page = context.new_page()
    page.expose_function('unexpectedWalletCall', lambda method: external_calls.append(method))
    page.add_init_script('window.ethereum = {request: ({method}) => {window.unexpectedWalletCall(method); throw new Error("Unexpected wallet prompt")}}')

    def first_failed_request(route):
        if route.request.method == 'POST':
            submissions.append(route.request.url)
            if len(submissions) == 1:
                # Replay an actual pre-broadcast Circle failure from this account.
                # Subsequent submission, signing, mining and UI result are live.
                route.fulfill(status=200, content_type='application/json', body=json.dumps({'id': failed_request}))
                return
        route.continue_()

    page.route('**/api/keeper/transactions', first_failed_request)
    page.on('response', lambda response: responses.append(response) if '/api/keeper/transactions' in response.url else None)
    try:
        page.goto('https://ashenkin.xyz/#/arena/defend/10', wait_until='domcontentloaded')
        page.get_by_role('button', name='Recall and refund', exact=True).click(timeout=60000)
        page.get_by_text('Synchronizing your game wallet with Sepolia…', exact=True).first.wait_for(timeout=40000)
        page.screenshot(path=str(output / 'circle-recovery-waiting.png'))
        page.get_by_text('Defender recalled, stake refunded', exact=True).wait_for(timeout=180000)
        assert len(submissions) == 2, len(submissions)
        assert not external_calls, external_calls
        hashes = []
        request_ids = []
        for response in responses:
            data = response.json()
            if data.get('hash'):
                hashes.append(data['hash'])
            if data.get('id') and data['id'] != failed_request:
                request_ids.append(data['id'])
        assert len(set(hashes)) == 1, hashes
        assert len(request_ids) == 1, request_ids
        page.screenshot(path=str(output / 'circle-recovery-complete.png'))
        record = {'player': 9, 'status': 'passed', 'replayedRealPrebroadcastFailure': failed_request, 'submissionsIncludingReplay': len(submissions), 'liveSubmissions': 1, 'externalWalletCalls': external_calls, 'hash': hashes[0], 'requestId': request_ids[0]}
        (output / 'recovery.json').write_text(json.dumps(record, indent=2))
        print(json.dumps(record), flush=True)
    finally:
        context.close()
        browser.close()
