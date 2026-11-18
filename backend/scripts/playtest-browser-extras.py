import json
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[2] / 'uploads/playtest-20261118'
output = root / 'ui'
player = json.loads((root / 'private.json').read_text())['players'][2]
result = {'status': 'running', 'guestGates': []}
binary = 'C:/Users/TBC/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe'

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=binary, args=['--disable-gpu'])
    guest = browser.new_context(viewport={'width': 320, 'height': 844})
    owner = None
    try:
        page = guest.new_page()
        for route in ['oracle', 'relics', 'raffle', 'quests', 'depths']:
            page.goto('https://ashenkin.xyz/#/' + route, wait_until='domcontentloaded')
            page.locator('section[aria-label="Starter NFT"]').first.wait_for(timeout=25000)
            assert page.get_by_role('button', name='Open door 1,', exact=False).count() == 0
            result['guestGates'].append({'route': route, 'status': 'passed'})
        page.goto('https://ashenkin.xyz/#/arena/trial/start', wait_until='domcontentloaded')
        page.locator('section[aria-label="Starter NFT"]').first.wait_for(timeout=25000)
        assert page.get_by_role('button', name='Fight three rounds', exact=True).count() == 0
        result['guestGates'].append({'route': 'arena/trial/start', 'status': 'passed'})
        page.screenshot(path=str(output / 'guest-nft-gate.png'))
        owner = browser.new_context(viewport={'width': 320, 'height': 844})
        name, value = player['cookie'].split('=', 1)
        owner.add_cookies([{'name': name, 'value': value, 'domain': 'ashenkin.xyz', 'path': '/', 'httpOnly': True, 'secure': True, 'sameSite': 'Lax'}])
        page = owner.new_page()
        writes = []
        page.on('request', lambda request: writes.append(request.url) if request.method == 'POST' and any(part in request.url for part in ['/transactions', '/starter', '/lab-key', '/wallet/']) else None)
        page.goto('https://ashenkin.xyz/#/depths', wait_until='domcontentloaded')
        page.get_by_text('Practice with the lantern · no gas', exact=True).click(timeout=30000)
        trial = page.locator('section[aria-labelledby="lantern-trial-title"]')
        trial.get_by_role('button', name='Open door 1,', exact=False).click()
        trial.get_by_role('button', name='Show what a public chain would expose', exact=True).click()
        trial.get_by_role('button', name='Open door 2,', exact=False).click()
        trial.get_by_role('button', name='Roll a new floor', exact=True).click()
        assert trial.get_by_role('button', name='Open door 1,', exact=False).is_enabled()
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
        result['ownerLanternTrial'] = 'passed'
        page.screenshot(path=str(output / 'owner-lantern-trial.png'))
        page.goto('https://ashenkin.xyz/#/arena/5', wait_until='domcontentloaded')
        page.get_by_text('Playbook · #5', exact=True).click(timeout=30000)
        book = page.locator('.chm-playbooks')
        book.get_by_label('Name this plan').fill('Audit counter')
        book.get_by_role('button', name='Save', exact=True).click()
        book.get_by_role('button', name='Apply Audit counter', exact=True).wait_for()
        page.reload(wait_until='domcontentloaded')
        page.get_by_text('Playbook · #5', exact=True).click(timeout=30000)
        book.get_by_role('button', name='Apply Audit counter', exact=True).click()
        book.get_by_role('button', name='Delete Audit counter', exact=True).click()
        assert book.get_by_role('button', name='Apply Audit counter', exact=True).count() == 0
        result['playbookSaveReloadApplyDelete'] = 'passed'
        page.goto('https://ashenkin.xyz/#/journal', wait_until='domcontentloaded')
        page.get_by_role('button', name='Read the old records', exact=False).click(timeout=30000)
        for label in ['Tracks', 'Lantern', 'Crest']:
            page.get_by_role('button', name=label, exact=True).click()
        page.get_by_role('button', name='Guide the hatchlings', exact=False).click()
        page.get_by_role('heading', name='Light for the Nursery', exact=True).wait_for()
        result['beaconArchiveAndShelterEnding'] = 'passed'
        result['unexpectedSigningOrTransactionRequests'] = len(writes)
        assert not writes, writes
        result['status'] = 'passed'
    except Exception as error:
        result['status'] = 'failed'
        result['error'] = str(error)[:600]
        page.screenshot(path=str(output / 'extras-failure.png'), full_page=True)
        raise
    finally:
        (output / 'extras.json').write_text(json.dumps(result, indent=2))
        print(json.dumps(result), flush=True)
        guest.close()
        if owner:
            owner.close()
        browser.close()
