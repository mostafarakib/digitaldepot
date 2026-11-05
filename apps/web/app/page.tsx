import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      <h1>DigitalDepot</h1>
      <p>Electronics &amp; Consumer Technology Store</p>
      <nav>
        <Link href="/status">Check API Status →</Link>
      </nav>
    </main>
  );
}
