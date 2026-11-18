"""One-shot QA worker: close due rounds, then restore the journaled production rules."""
import json
import os
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

container = 'ashenkin-game-1'
directory = '/app/backend/db/playtest-20261118'
status_file = Path('/opt/ashenkin/auth/reward-runner-status.json')
log_file = Path('/opt/ashenkin/auth/reward-runner.log')
status = {'pid': os.getpid(), 'phase': 'starting'}

def save(**values):
    status.update(values)
    status['updatedAt'] = datetime.now(timezone.utc).isoformat()
    status_file.write_text(json.dumps(status, indent=2))

def run(script, mode=None, timeout=1200):
    command = ['docker', 'exec', '--workdir', '/app/backend', container, 'node', 'db/playtest-20261118/' + script]
    if mode:
        command.append(mode)
    with log_file.open('a') as log:
        return subprocess.run(command, stdout=log, stderr=log, timeout=timeout).returncode

try:
    result = subprocess.run(['docker', 'exec', container, 'cat', directory + '/reward-deadlines.json'], capture_output=True, text=True, check=True)
    journal = json.loads(result.stdout)
    target = journal['target']
    save(phase='waiting', targetUTC=datetime.fromtimestamp(target, timezone.utc).isoformat())
    while time.time() < target:
        time.sleep(min(20, target - time.time()))
    save(phase='closing')
    save(closeExit=run('playtest-rewards-close.js'))
except Exception as error:
    save(error=type(error).__name__ + ': ' + str(error)[:200])
finally:
    save(phase='restoring')
    restored = False
    for attempt in range(3):
        try:
            code = run('playtest-reward-deadlines.js', 'restore', timeout=300)
            save(restoreExit=code, restoreAttempt=attempt + 1)
            if code == 0:
                restored = True
                break
        except Exception as error:
            save(restoreError=type(error).__name__)
        time.sleep(10)
    save(phase='done' if restored and status.get('closeExit') == 0 else 'needs-review', restored=restored)
