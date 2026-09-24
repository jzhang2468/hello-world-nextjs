import { Suspense } from "react";
import Link from "next/link";
import RetryButton from "./components/retry-button";
import Catalogue from "./components/catalogue";
import { getProducts } from "@/lib/products";
import { getDisplayFont } from "@/lib/site-settings";

async function ProductCollection() {
  const [result, displayFont] = await Promise.all([
    getProducts(),
    getDisplayFont(),
  ]);
  if (result.error !== null)
    return (
      <main className="service-state">
        <Link className="wordmark" href="/">
          FurFrame Studio
        </Link>
        <span aria-hidden="true">✳</span>
        <h1>Our collection will be right back.</h1>
        <p>We couldn’t load the collection. Please try again in a moment.</p>
        <RetryButton />
      </main>
    );
  return (
    <div className="catalogue-shell" data-display-font={displayFont}>
      <Catalogue products={result.data} />
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="service-state" aria-busy="true">
          <span className="wordmark">FurFrame Studio</span>
          <span className="loading-star" aria-hidden="true">
            ✳
          </span>
          <p role="status">Fetching a few new favourites…</p>
        </main>
      }
    >
      <ProductCollection />
    </Suspense>
  );
}
