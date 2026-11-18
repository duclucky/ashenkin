"""Isolated headless UI checks; API responses are fixtures, no transactions sent."""
import json
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[2]
out = root / 'uploads/patrol-ui'
out.mkdir(parents=True, exist_ok=True)
binary = 'C:/Users/TBC/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe'
address = '0x8fA7cBB2B6641F6AA6Afe9705D981f510Da483fC'
result = {'mode': 'mock camp API + real public Sepolia reads; no signing or transactions', 'checks': [], 'pageErrors': []}

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=binary, args=['--disable-gpu'])
    try:
        for width, height in [(320, 740), (390, 844), (1440, 900), (844, 390)]:
            context = browser.new_context(viewport={'width': width, 'height': height})
            cache = json.loads((root / 'uploads/patrol-public-cache.json').read_text())
            context.add_init_script('const publicPhenotypes = ' + json.dumps(cache) + '; for (const [k,v] of Object.entries(publicPhenotypes)) localStorage.setItem(k,v);')
            page = context.new_page()
            page.on('pageerror', lambda error: result['pageErrors'].append(str(error)[:300]))
            jobs = []
            posts = []
            def keeper(route):
                url = route.request.url
                if '/patrols' not in url:
                    route.fulfill(json={'enabled': True, 'email': True, 'sponsored': False, 'signedIn': True, 'method': 'wallet', 'address': address})
                elif route.request.method == 'GET':
                    route.fulfill(json={'enabled': True, 'consent': 'offline-patrol-v1', 'jobs': jobs})
                elif '/stop' in url:
                    jobs[0]['stopped'] = True
                    route.fulfill(json=jobs[0])
                else:
                    data = route.request.post_data_json
                    posts.append(data)
                    now = int(time.time() * 1000)
                    jobs.append({'id': 'fixture-patrol', 'active': True, 'stopped': False, 'creatureId': data['creatureId'], 'zone': data['zone'], 'trips': data['trips'], 'completed': 0, 'budgetWei': '10000000000000000', 'spentWei': '0', 'phase': 'away', 'expiresAt': now + 8 * 3600000, 'startedAt': now // 1000 - 180, 'endsAt': now // 1000 + 420, 'expeditionId': 999, 'journal': [{'at': now, 'type': 'assigned'}, {'at': now, 'type': 'departed'}]})
                    route.fulfill(json=jobs[0])
            page.route('**/api/keeper**', keeper)
            page.goto('http://127.0.0.1:5185/#/expeditions', wait_until='domcontentloaded')
            page.get_by_role('heading', name='The wilds don’t sleep.').wait_for()
            button = page.get_by_role('button', name='Begin offline patrol')
            assert button.is_disabled()
            # The public owner of NFT 13 is used only for visual rendering.
            page.locator('.patrol-roster button').first.wait_for(timeout=40000)
            page.locator('.patrol-xeno svg[aria-label="Pixel monster"]').wait_for(timeout=20000)
            page.get_by_role('checkbox').check()
            assert button.is_enabled()
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), width
            page.screenshot(path=str(out / f'setup-{width}.png'), full_page=True)
            button.click()
            page.get_by_text('ACTIVE ORDERS', exact=False).wait_for()
            assert posts[0]['consent'] == 'offline-patrol-v1'
            assert posts[0]['trips'] == 3
            animations = page.locator('.patrol-scene').evaluate('(e) => e.getAnimations({subtree:true}).length')
            assert animations > 0
            page.screenshot(path=str(out / f'away-{width}.png'), full_page=True)
            page.locator('.patrol-scene').screenshot(path=str(out / f'scene-{width}.png'))
            page.get_by_role('button', name='Stop after this trip').click()
            page.get_by_role('button', name='No more departures').wait_for()
            assert page.get_by_role('link', name='Manual return', exact=True).is_visible()
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), width
            page.emulate_media(reduced_motion='reduce')
            assert page.locator('.patrol-walking').evaluate('(e) => getComputedStyle(e).animationName') == 'none'
            page.get_by_role('link', name='Single expedition', exact=True).click()
            page.get_by_role('heading', name='Choose a route', exact=True).wait_for()
            result['checks'].append({'width': width, 'height': height, 'consent': True, 'start': True, 'stop': True, 'animationCount': animations, 'reducedMotion': True, 'manualMode': True, 'overflow': False})
            context.close()
        assert not result['pageErrors'], result['pageErrors']
        result['status'] = 'passed'
    except Exception as error:
        result['status'] = 'failed'; result['error'] = str(error)[:500]
        page.screenshot(path=str(out / 'failure.png'), full_page=True)
        raise
    finally:
        (out / 'result.json').write_text(json.dumps(result, indent=2), encoding='utf8')
        print(json.dumps(result), flush=True)
        browser.close()
