'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Try it' },
  { href: '/index', label: 'Evidence' },
  { href: '/how', label: 'How it works' },
  { href: '/connect', label: 'Connect' },
];

export function Nav() {
  const path = usePathname();
  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
  return (
    <nav className="topnav">
      <div className="topnav-inner">
        <Link href="/" className="topnav-brand">
          agent<span>index</span>
        </Link>
        <div className="topnav-links">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={active(l.href) ? 'on' : undefined}>
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
