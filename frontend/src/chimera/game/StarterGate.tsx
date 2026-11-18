import { GasFaucet } from './GasFaucet'
import { useState } from 'react'
import { Egg, Mail, Wallet } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Link, useAction } from '../ui'
import { ACTIVE_WORLD, applyKeeperSession, connect, provisionKeeper, refreshKeeperSession, signInWithWallet, useWallet } from '../chain'
import { useMyCreatures, useRefresh, useEthBalance } from '../hooks'
import { keeperRequest, type KeeperSession } from '../keeper-api'
import { mintStarter } from '../starter-hatch'
import { Px } from './art'
import { PROF, PROF_PAL } from './map-art'

export function StarterGate({ lab = false, children }: { lab?: boolean; children?: React.ReactNode }) {
  const { account, connecting, mode, keeper, keeperError } = useWallet()
  const mine = useMyCreatures(account)
  const eth = useEthBalance(account)
  const query = useQueryClient()
  const refresh = useRefresh()
  const { busy, run } = useAction()
  const [email, setEmail] = useState('')
  const [challenge, setChallenge] = useState('')
  const [code, setCode] = useState('')

  async function hatch() {
    const result = await run('Mint starter NFT', mintStarter, 'Your starter has hatched', { spec: { kind: 'hatch', firstHatch: true } })
    if (!result) return
    query.setQueryData<number[]>(['mine', result.owner], current => current?.includes(result.id) ? current : [result.id, ...(current ?? [])])
    refresh('mine', 'account', 'world', 'quests')
  }

  async function signIn() {
    await run('Sign in with wallet', async () => {
      await signInWithWallet()
      await provisionKeeper()
    }, 'Ashenkin wallet ready')
  }

  async function emailSignIn() {
    if (!challenge) {
      const result = await run('Send sign-in code', () => keeperRequest<{ id: string }>('email/start', { email }, 30_000), 'Check your email')
      if (result) setChallenge(result.id)
      return
    }
    await run('Verify email', async () => {
      applyKeeperSession(await keeperRequest<KeeperSession>('email/finish', { id: challenge, code }))
      setCode('')
      setChallenge('')
      await provisionKeeper()
    }, 'Ashenkin wallet ready')
  }

  const waiting = lab && ACTIVE_WORLD === 'ashenkin' && !keeper && !keeperError
  return (
    <section className="chm-briefing chm-guest" aria-label="Starter NFT">
      <div className="chm-lumen-portrait" aria-hidden="true"><Px rows={PROF} pal={PROF_PAL} /></div>
      <div className="chm-guest-copy min-w-0">
        <span>Professor Lumen</span>
        <p>{children ?? 'Hatch your starter NFT to begin.'}</p>
        {lab && keeper?.enabled && !account && <p className="mt-1 text-xs">Sign in to access the same game wallet on any device. Ashenkin manages the wallet through Circle.</p>}
        {lab && mode === 'circle' && account && keeper?.sponsored && <p className="mt-1 text-xs">Free Sepolia gas is available below for your first mint.</p>}
        {lab && mode === 'circle' && account && !keeper?.sponsored && <p className="mt-1 text-xs">The mint uses Sepolia ETH from your Ashenkin wallet.</p>}
      </div>
      <div className="chm-guest-actions">
        {!lab && <Link to="lab" className="chm-btn chm-btn-primary"><Egg size={16} aria-hidden="true" /> Visit the Lab</Link>}
        {waiting && <span role="status">Checking your session…</span>}
        {lab && keeperError && !keeper && <Button onClick={refreshKeeperSession}>Retry sign-in</Button>}
        {lab && !waiting && !keeperError && !keeper?.enabled && !account && <Button busy={connecting} onClick={() => run('Connect wallet', connect, 'Wallet connected')}>Connect existing wallet</Button>}
        {lab && mode === 'circle' && account && !mine.data?.length &&
          <Button className={eth && eth > 0n ? "chm-quest-target first-target" : "chm-quest-target"} busy={busy === 'Mint starter NFT'} disabled={eth == null || eth === 0n || (!!busy && busy !== 'Mint starter NFT')} onClick={hatch}><Egg size={16} aria-hidden="true" /> Mint starter NFT</Button>}
        {lab && keeper?.signedIn && !account && <Button disabled={!!busy} onClick={() => run('Prepare game wallet', provisionKeeper, 'Ashenkin wallet ready')}>Prepare my game wallet</Button>}
        {lab && keeper?.enabled && !keeper.signedIn && <Button variant={keeper.email ? 'ghost' : 'primary'} disabled={!!busy} onClick={signIn}><Wallet size={16} aria-hidden="true" /> Sign in with wallet</Button>}
        {account && mine.isError && <Button variant="ghost" onClick={() => void mine.refetch()}>Retry NFT check</Button>}
      </div>
      {lab && mode === 'circle' && account && <div className={eth === 0n ? "basis-full first-target" : "basis-full"} id="starter-gas"><GasFaucet /></div>}
      {lab && keeper?.email && !keeper.signedIn && (
        <form className="grid min-w-0 basis-full gap-2" onSubmit={event => { event.preventDefault(); void emailSignIn() }}>
          {!challenge ? <label className="grid gap-1 text-sm font-bold">Email
            <input className="min-h-11 rounded border border-current px-3 font-normal" type="email" name="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required />
          </label> : <label className="grid min-w-0 gap-1 text-sm font-bold [overflow-wrap:anywhere]">Eight-digit code sent to {email}
            <input className="min-h-11 rounded border border-current px-3 font-normal" inputMode="numeric" name="code" autoComplete="one-time-code" pattern="[0-9]{8}" maxLength={8} value={code} onChange={event => setCode(event.target.value)} required />
          </label>}
          <Button type="submit" busy={busy === 'Send sign-in code' || busy === 'Verify email'} disabled={!!busy && busy !== 'Send sign-in code' && busy !== 'Verify email'}><Mail size={16} aria-hidden="true" />{challenge ? 'Verify email' : 'Send sign-in code'}</Button>
          {challenge && <Button variant="ghost" disabled={!!busy} onClick={() => { setChallenge(''); setCode('') }}>Change email or resend code</Button>}
        </form>
      )}
    </section>
  )
}
