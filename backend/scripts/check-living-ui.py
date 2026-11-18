"""Isolated browser QA. Fixture life API; real public NFT reads; no signing."""
import json
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[2]
out = root / 'uploads/living-ui'
out.mkdir(parents=True, exist_ok=True)
binary = 'C:/Users/TBC/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe'
address = '0x8fA7cBB2B6641F6AA6Afe9705D981f510Da483fC'
result = {'mode': 'fixture life API + verified public phenotype cache; no transactions', 'checks': [], 'pageErrors': []}
now = int(time.time() * 1000)
day = now // 86400000
hash_value = '0x' + '42' * 32

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=binary, args=['--disable-gpu'])
    try:
        for width, height in [(320, 740), (390, 844), (1440, 900), (844, 390)]:
            context = browser.new_context(viewport={'width': width, 'height': height})
            cache = json.loads((root / 'uploads/patrol-public-cache.json').read_text())
            context.add_init_script('const publicPhenotypes = ' + json.dumps(cache) + '; for (const [k,v] of Object.entries(publicPhenotypes)) localStorage.setItem(k,v);')
            page = context.new_page()
            page.on('pageerror', lambda error: result['pageErrors'].append(str(error)[:300]))
            posts = []
            data = {'enabled': True, 'contract': '0x1111111111111111111111111111111111111111', 'day': day, 'status': 'settled', 'nextDayAt': (day+1)*86400000, 'lastTick': now, 'inventory': [{'item': 1, 'quantity': 5}, {'item': 2, 'quantity': 2}], 'equipped': None, 'history': []}
            for i, values in enumerate([(0, 0, True, 1, 1, 304), (1, 1, False, 0, 0, 5), (2, 2, True, 3, 1, 378)]):
                kind, tier, won, item, quantity, code = values
                data['history'].append({'day': day-i, 'nft': 13, 'kind': kind, 'tier': tier, 'won': won, 'item': item, 'quantity': quantity, 'code': code, 'at': now-i*86400000, 'hash': hash_value, 'handle': hash_value})
            def keeper(route):
                url = route.request.url
                if '/life' not in url:
                    route.fulfill(json={'enabled': True, 'email': True, 'sponsored': False, 'signedIn': True, 'method': 'wallet', 'address': address})
                elif '/proof/' in url:
                    route.fulfill(json={'value': 0, 'cleartexts': '0x' + '00'*32, 'proof': '0x'})
                elif route.request.method == 'POST':
                    posts.append(url)
                    if '/craft' in url:
                        data['inventory'] = [{'item': 3, 'quantity': 1}]
                    elif '/equip' in url:
                        data['equipped'] = route.request.post_data_json['item']
                    else:
                        raise AssertionError('Unexpected spending endpoint: ' + url)
                    route.fulfill(json=data)
                elif '/life/13' in url:
                    route.fulfill(json=data)
                else:
                    route.fulfill(json={'enabled': True, 'specimens': [13]})
            page.route('**/api/keeper**', keeper)
            page.goto('http://127.0.0.1:5186/#/life', wait_until='domcontentloaded')
            page.get_by_role('heading', name='Their story keeps going.').wait_for()
            page.locator('.living-resident svg[aria-label="Pixel monster"]').wait_for(timeout=20000)
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), width
            page.locator('.living-scene').screenshot(path=str(out / f'resident-{width}.png'))
            for index in range(3):
                page.get_by_role('button', name='Watch story', exact=True).nth(index).click()
                page.get_by_role('button', name='Skip ahead').click()
                page.locator('.phase-1').wait_for()
                assert page.locator('.living-scene').evaluate('(e)=>e.getAnimations({subtree:true}).length') > 0
                if width == 390:
                    page.locator('.living-scene').screenshot(path=str(out / f'challenge-{index}.png'))
                page.get_by_role('button', name='Skip ahead').click()
                page.locator('.living-outcome').wait_for()
                page.wait_for_timeout(600)
                expected = 'HOME SAFE' if index == 1 else 'CHALLENGE CLEARED'
                assert page.locator('.living-outcome').inner_text().startswith(expected)
                page.locator('.living-scene').screenshot(path=str(out / f'outcome-{index}-{width}.png'))
                page.get_by_role('button', name='Close story', exact=True).click()
            page.get_by_role('button', name='Craft lantern', exact=True).click()
            page.get_by_role('button', name='Equip Trail lantern', exact=True).wait_for()
            page.get_by_role('button', name='Equip Trail lantern', exact=True).click()
            page.locator('.living-equipped-lantern').wait_for()
            page.get_by_role('button', name='Verify', exact=True).first.click()
            page.get_by_text('The story does not match its decryption proof.', exact=True).wait_for()
            assert len(posts) == 2
            page.get_by_role('button', name='Pause scene animation', exact=True).click()
            assert page.locator('.living-scene').evaluate('(e)=>e.classList.contains("is-paused")')
            page.emulate_media(reduced_motion='reduce')
            page.get_by_role('button', name='Watch story', exact=True).first.click()
            page.get_by_role('button', name='Next', exact=True).click()
            page.get_by_role('button', name='Next', exact=True).click()
            assert page.locator('.living-resident').evaluate('(e)=>getComputedStyle(e).animationName') == 'none'
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), width
            result['checks'].append({'width': width, 'height': height, 'threeReplays': True, 'winLoss': True, 'craftEquip': True, 'forgedProofRejected': True, 'reducedMotion': True, 'overflow': False, 'walletActions': 0})
            context.close()
        assert not result['pageErrors'], result['pageErrors']
        result['status'] = 'passed'
    except Exception as error:
        result['status'] = 'failed'; result['error'] = str(error)[:600]
        page.screenshot(path=str(out / 'failure.png'), full_page=True)
        raise
    finally:
        (out / 'result.json').write_text(json.dumps(result, indent=2), encoding='utf8')
        print(json.dumps(result), flush=True)
        browser.close()
