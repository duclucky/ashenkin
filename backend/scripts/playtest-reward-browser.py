import json
import re
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

workspace = Path(__file__).resolve().parents[2]
output = workspace / 'docs/qa-rewards-2026-11-18/ui'
output.mkdir(exist_ok=True)
private = json.loads((workspace / 'uploads/playtest-20261118/private.json').read_text())
phase = sys.argv[1] if len(sys.argv) > 1 else 'before'
binary = 'C:/Users/TBC/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe'
result = {'phase': phase, 'checks': [], 'pageErrors': []}

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=binary, args=['--disable-gpu'])
    def page_for(index):
        context = browser.new_context(viewport={'width': 390, 'height': 844})
        name, value = private['players'][index]['cookie'].split('=', 1)
        context.add_cookies([{'name': name, 'value': value, 'domain': 'ashenkin.xyz', 'path': '/', 'httpOnly': True, 'secure': True, 'sameSite': 'Lax'}])
        page = context.new_page()
        page.on('pageerror', lambda error: result['pageErrors'].append(str(error)[:200]))
        return context, page

    try:
        if phase == 'before':
            context, page = page_for(4)
            page.goto('https://ashenkin.xyz/#/oracle', wait_until='domcontentloaded')
            page.locator('summary').filter(has_text='Earlier rounds').click(timeout=30000)
            page.get_by_text('JACKPOT WON', exact=True).wait_for(timeout=30000)
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
            result['checks'].append({'name': 'Oracle UI displays the confirmed jackpot win', 'status': 'passed'})
            page.screenshot(path=str(output / 'oracle-jackpot-won.png'), full_page=True)
            context.close()
            context, page = page_for(1)
            page.goto('https://ashenkin.xyz/#/hall', wait_until='domcontentloaded')
            page.get_by_text('17 season pts', exact=True).first.wait_for(timeout=30000)
            result['checks'].append({'name': 'Hall displays earned points and the occupied season thrones', 'status': 'passed'})
            page.screenshot(path=str(output / 'season-before-close.png'), full_page=True)
            context.close()
        else:
            outcome = json.loads((workspace / 'docs/qa-rewards-2026-11-18/reward-settlement-result.json').read_text())
            audit = json.loads((workspace / 'docs/qa-2026-11-18/report.json').read_text())
            winner = outcome['raffle']['winner'].lower()
            index = next(i for i, player in enumerate(audit['players']) if player['address'].lower() == winner)
            context, page = page_for(index)
            page.goto('https://ashenkin.xyz/#/raffle', wait_until='domcontentloaded')
            page.get_by_text('1 raffle win', exact=True).wait_for(timeout=30000)
            page.get_by_text('round #1', exact=True).wait_for(timeout=30000)
            result['checks'].append({'name': 'Raffle UI displays the paid winner and past draw', 'status': 'passed'})
            page.screenshot(path=str(output / 'raffle-paid.png'), full_page=True)
            context.close()
            context, page = page_for(1)
            page.goto('https://ashenkin.xyz/#/hall', wait_until='domcontentloaded')
            page.get_by_text('SEASON 2', exact=True).wait_for(timeout=30000)
            page.get_by_text('1 CROWN WON', exact=True).wait_for(timeout=30000)
            page.get_by_text('Season 1 crowns', exact=True).wait_for(timeout=30000)
            result['checks'].append({'name': 'Hall shows season 2, the earned crown and season 1 winners', 'status': 'passed'})
            page.screenshot(path=str(output / 'season-prizes-paid.png'), full_page=True)
            context.close()
            context, page = page_for(0)
            page.goto('https://ashenkin.xyz/#/oracle', wait_until='domcontentloaded')
            page.get_by_text('unsolved, jackpot rolled over', exact=True).wait_for(timeout=30000)
            result['checks'].append({'name': 'Oracle UI displays the expired round and rolled-over jackpot', 'status': 'passed'})
            page.screenshot(path=str(output / 'oracle-expired.png'), full_page=True)
            context.close()
        assert not result['pageErrors'], result['pageErrors']
        result['status'] = 'passed'
    except Exception as error:
        result['status'] = 'failed'
        result['error'] = str(error)[:600]
        page.screenshot(path=str(output / (phase + '-failure.png')), full_page=True)
        raise
    finally:
        (output / (phase + '.json')).write_text(json.dumps(result, indent=2))
        print(json.dumps(result), flush=True)
        browser.close()
