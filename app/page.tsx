'use client';

import Link from 'next/link';
import { MusicPlayer } from '@/components/ui/MusicPlayer';
import { SiteFooter } from '@/components/ui/SiteFooter';
import { LivePriceLine } from '@/components/ui/LivePriceLine';
import { EarthHorizon } from '@/components/landing/EarthHorizon';

const partners = [
  { name: 'Monad', logo: '/logos/chains/monad.svg', href: 'https://monad.xyz' },
  { name: 'Agora', logo: '/logos/sponsors/agora.svg', href: 'https://www.agora.finance' },
  { name: 'Mera', logo: '/logos/sponsors/mera.svg', href: 'https://www.category.xyz' },
  { name: 'Dynamic', logo: '/logos/sponsors/dynamic.svg', href: 'https://www.dynamic.xyz' },
  { name: 'Chainlink', logo: '/logos/sponsors/chainlink.svg', href: 'https://chain.link' },
  { name: 'Envio', logo: '/logos/sponsors/envio.svg', href: 'https://envio.dev' },
  { name: 'Nansen', logo: '/logos/sponsors/nansen.png', href: 'https://nansen.ai' },
  { name: 'Aurora', logo: '/logos/sponsors/aurora.svg', href: 'https://aurora.dev' },
  { name: 'Perpl', logo: '/logos/sponsors/perpl.svg', href: 'https://app.perpl.xyz' },
  { name: 'MetaMask', logo: '/logos/sponsors/metamask.svg', href: 'https://metamask.io' },
];

const steps = [
  {
    n: '01',
    title: 'Connect a wallet',
    body: 'Sign in on Monad with a Mera passkey or MetaMask. Deposit AUSD or MON. Rounds settle from that house balance.',
  },
  {
    n: '02',
    title: 'Pick the chart',
    body: 'Trade crypto, stocks, metals, and FX. Classic is up or down. Box targets a range. Draw uses the zone you mark.',
  },
  {
    n: '03',
    title: 'Settle the tick',
    body: 'Rounds run from 5 seconds to 1 minute. The close uses the live mid, and a win pays back into the house balance.',
  },
];

const faqs = [
  {
    q: 'How does the house balance work?',
    a: 'You deposit AUSD or MON to the Monad treasury. That credit is the house balance, so a round can open and settle without a transaction.',
  },
  {
    q: 'What can I trade?',
    a: 'Crypto, stocks, metals, and FX. The chart uses Pyth, then an exchange quote. A market with no live price stays blank.',
  },
  {
    q: 'What are the trade modes?',
    a: 'Classic is up or down. Box wins if the close lands in a price band. Draw wins if the close lands inside a zone you draw on the chart.',
  },
  {
    q: 'Where do deposits sit?',
    a: 'Deposits sit in the Monad treasury. A withdrawal pays the same asset, AUSD or MON, back to the wallet.',
  },
];

export default function HomePage() {
  return (
    <div className="monad-page bg-[#FCFBFF] text-[#1A1330]">
      <MusicPlayer />
      <section className="relative flex min-h-[calc(100dvh-4rem)] flex-col overflow-hidden bg-[#070010]">
        <EarthHorizon />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-40 bg-gradient-to-b from-[#070010] to-transparent" />
        <div className="relative z-10 flex flex-1 flex-col items-center justify-start px-5 pb-16 pt-[16vh] text-center">
          <h1 className="rh-display mb-6 max-w-4xl text-[clamp(3.5rem,9vw,6.25rem)] tracking-[-0.045em] text-[#FCFBFF]">
            MonBlip.fun
          </h1>
          <p className="max-w-2xl text-[1.125rem] font-normal leading-[1.45] text-[#E4E4E4] sm:text-[1.35rem]">
            Short charts across crypto, stocks, metals, commodities and FX.
            <br />
            Connect a wallet, fund the house balance, and trade the move.
          </p>
        </div>
        <div className="relative z-10">
          <LivePriceLine />
        </div>
      </section>

      <section className="bg-[#FCFBFF]">
        <div className="rh-container py-10">
          <p className="text-center text-[11px] font-medium uppercase tracking-[0.22em] text-[#B781FE]">
            Built with
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            {partners.map((p) => (
              <a key={p.name} href={p.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-[#E6E0F5] bg-white px-3 py-2 text-sm font-medium text-[#1A1330] shadow-[0_8px_24px_rgb(110_84_255_/_6%)]">
                <img src={p.logo} alt="" className="h-6 w-6 object-contain" />
                {p.name}
              </a>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="bg-[#070010]">
        <div className="rh-container py-16 sm:py-20">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#B781FE]">How it works</p>
          <h2 className="rh-display mt-3 text-[clamp(2.4rem,5vw,3.5rem)] text-[#FCFBFF]">Fund. Mark. Settle.</h2>
          <p className="mt-3 whitespace-nowrap text-[clamp(0.95rem,1.6vw,1.125rem)] leading-snug text-[#E4E4E4]">
            A house balance in AUSD or MON, with the price path drawn from a public quote.
          </p>
          <div className="mt-10 grid items-stretch gap-4 md:grid-cols-3">
            {steps.map((step) => (
              <article key={step.n} className="flex h-full flex-col rounded-2xl border border-white/10 bg-[#15111B] p-6">
                <span className="inline-flex h-7 w-9 items-center justify-center rounded-full bg-[#7005FC] text-[11px] font-medium text-white">{step.n}</span>
                <h3 className="mt-5 text-xl font-medium tracking-[-0.02em] text-[#FCFBFF]">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#E4E4E4]">{step.body}</p>
              </article>
            ))}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {[
              ['Classic', 'Up or down against the open. Fixed payout when the close agrees.'],
              ['Box', 'A price band. Higher payout when the close lands inside it.'],
              ['Draw', 'Your own zone on the chart. It wins if the close stays inside.'],
            ].map(([title, body]) => (
              <article key={title} className="rounded-2xl border border-white/10 bg-[#15111B] px-6 py-5">
                <h3 className="text-lg font-medium tracking-[-0.02em] text-[#FCFBFF]">{title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-[#E4E4E4]">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="questions" className="bg-[#070010]">
        <div className="rh-container py-16 sm:py-20">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#B781FE]">Questions</p>
          <h2 className="rh-display mt-3 text-[clamp(2.4rem,5vw,3.5rem)] text-[#FCFBFF]">Straight answers</h2>
          <dl className="mt-10 grid items-stretch gap-4 md:grid-cols-2">
            {faqs.map((item) => (
              <div key={item.q} className="rounded-2xl border border-white/10 bg-[#15111B] p-6">
                <dt className="text-lg font-medium tracking-[-0.02em] text-[#FCFBFF]">{item.q}</dt>
                <dd className="mt-2 text-sm leading-6 text-[#E4E4E4]">{item.a}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-16 border-t border-white/10 pt-14 text-center">
            <h2 className="rh-display text-[clamp(2.4rem,5vw,3.5rem)] text-[#FCFBFF]">Open the chart.</h2>
            <Link href="/trade" className="neon-btn mt-6 h-12 px-8 text-[0.95rem]">Launch</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
