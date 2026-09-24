"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import type { Product } from "@/lib/product-types";

function Icon({
  name,
  filled = false,
}: {
  name: "heart" | "arrow" | "search" | "close" | "menu";
  filled?: boolean;
}) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "heart" && (
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
      )}
      {name === "arrow" && (
        <>
          <path d="M5 12h14M12 5l7 7-7 7" />
        </>
      )}
      {name === "search" && (
        <>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </>
      )}
      {name === "close" && <path d="m6 6 12 12M18 6 6 18" />}
      {name === "menu" && <path d="M4 7h16M4 12h16M4 17h16" />}
    </svg>
  );
}

const money = (price: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(price);

export default function Catalogue({ products }: { products: Product[] }) {
  const [category, setCategory] = useState("All pieces");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("featured");
  const [saved, setSaved] = useState<number[]>([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const toggleSave = (id: number) =>
    setSaved((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  const visible = products
    .filter(
      (product) =>
        (category === "All pieces" || product.category === category) &&
        (!savedOnly || saved.includes(product.id)) &&
        `${product.name} ${product.category} ${product.color}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    )
    .sort((a, b) =>
      sort === "price-low"
        ? a.price - b.price
        : sort === "price-high"
          ? b.price - a.price
          : Number(b.featured) - Number(a.featured) ||
            a.display_order - b.display_order,
    );
  const openProduct = (product: Product) => {
    setSelected(product);
    dialog.current?.showModal();
  };
  const reset = () => {
    setQuery("");
    setCategory("All pieces");
    setSavedOnly(false);
  };

  return (
    <>
      <div className="announcement">
        FOR THE DOGS. AND THEIR PEOPLE.{" "}
        <span>Everyday essentials, a little less ordinary.</span>
      </div>
      <header className="site-header">
        <button
          className="icon-button mobile-menu"
          aria-label="Toggle navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <Icon name={menuOpen ? "close" : "menu"} />
        </button>
        <nav
          className={menuOpen ? "header-nav open" : "header-nav"}
          aria-label="Main navigation"
        >
          <a
            href="#collection"
            onClick={() => {
              reset();
              setMenuOpen(false);
            }}
          >
            The collection
          </a>
          <a href="#our-story" onClick={() => setMenuOpen(false)}>
            Our story
          </a>
        </nav>
        <a className="wordmark" href="#top" aria-label="FurFrame Studio home">
          FurFrame <span>Studio</span>
          <sup>®</sup>
        </a>
        <a
          href="#collection"
          className="saved-button"
          onClick={() => {
            setSavedOnly(!savedOnly);
            setCategory("All pieces");
            setQuery("");
          }}
          aria-label={
            savedOnly
              ? "Show all products"
              : `Show saved products, ${saved.length} saved`
          }
        >
          <Icon name="heart" filled={savedOnly} />
          <span>Saved ({saved.length})</span>
        </a>
      </header>
      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="tiny-star">✳</span> A GOOD DAY STARTS WITH A WALK
            </p>
            <h1 id="hero-title">
              Play Dirty,
              <br />
              Live Stylish<span className="pink-period">.</span>
            </h1>
            <p className="hero-description">
              A little colour. A little character. Thoughtful essentials for a
              life well lived with your best friend.
            </p>
            <a className="black-button" href="#collection">
              Explore the collection <Icon name="arrow" />
            </a>
            <div className="hero-note">
              <span className="color-dots">
                <i />
                <i />
                <i />
                <i />
              </span>{" "}
              Made for everyday adventures.
            </div>
          </div>
          <div className="hero-art">
            <Image
              src="/images/pink-vest-walk.jpg"
              alt="A dog in a pink cotton vest out for a rainy-day walk"
              fill
              priority
              sizes="(max-width: 760px) 100vw, 58vw"
            />
            <div className="hero-stamp">
              GOOD DOGS.
              <br />
              GREAT STYLE.<span>FURFRAME STUDIO</span>
            </div>
            <span className="hero-art-caption">
              THE EVERYDAY COLLECTION — 01
            </span>
          </div>
        </section>
        <div className="brand-strip">
          <span>SMALL DETAILS. BIG PERSONALITY.</span>
          <span aria-hidden="true">✳</span>
          <span>FOR EVERY KIND OF GOOD DOG.</span>
          <span aria-hidden="true">✳</span>
          <span>LET’S GO OUTSIDE.</span>
        </div>
        <section
          id="collection"
          className="collection"
          aria-labelledby="collection-title"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">A FEW NEW FAVOURITES</p>
              <h2 id="collection-title">
                The everyday edit
                <span> ( {products.length.toString().padStart(2, "0")} )</span>
              </h2>
            </div>
            <p>
              Good-looking things.
              <br />
              For very good company.
            </p>
          </div>
          <div className="catalogue-toolbar">
            <div className="category-tabs" aria-label="Product categories">
              {["All pieces", "Apparel", "Accessories"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setCategory(tab)}
                  aria-pressed={category === tab}
                  className={category === tab ? "active" : ""}
                >
                  {tab}
                </button>
              ))}
            </div>
            <label className="search-field">
              <Icon name="search" />
              <input
                aria-label="Search products"
                placeholder="Find your favourite…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <button aria-label="Clear search" onClick={() => setQuery("")}>
                  <Icon name="close" />
                </button>
              )}
            </label>
            <label className="sort-label">
              <span className="sr-only">Sort products</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="featured">Featured first</option>
                <option value="price-low">Price: low to high</option>
                <option value="price-high">Price: high to low</option>
              </select>
            </label>
          </div>
          <div className="results-line">
            <p aria-live="polite">
              {visible.length} {visible.length === 1 ? "piece" : "pieces"}
              {savedOnly
                ? " in your saved collection"
                : " to make your everyday"}
            </p>
            {savedOnly && (
              <button onClick={() => setSavedOnly(false)}>
                Clear saved filter <Icon name="close" />
              </button>
            )}
          </div>
          {visible.length ? (
            <div className="product-grid">
              {visible.map((product) => (
                <article className="product-card" key={product.id}>
                  <div className="product-image">
                    <button
                      className="product-view"
                      onClick={() => openProduct(product)}
                      aria-label={`View ${product.name} in ${product.color}`}
                    >
                      <Image
                        src={product.image_url}
                        alt={`${product.name} in ${product.color}`}
                        fill
                        sizes="(max-width: 600px) 50vw, (max-width: 1000px) 33vw, 25vw"
                      />
                    </button>
                    {product.featured && (
                      <span className="product-tag">TOP PICK</span>
                    )}
                    <button
                      className="save-product"
                      aria-label={`${saved.includes(product.id) ? "Unsave" : "Save"} ${product.name} in ${product.color}`}
                      aria-pressed={saved.includes(product.id)}
                      onClick={() => toggleSave(product.id)}
                    >
                      <Icon name="heart" filled={saved.includes(product.id)} />
                    </button>
                  </div>
                  <div className="product-info">
                    <div>
                      <p className="product-category">
                        {product.category} <span> / </span> {product.color}
                      </p>
                      <button
                        className="product-name"
                        onClick={() => openProduct(product)}
                      >
                        {product.name}
                      </button>
                      <p className="price">{money(product.price)}</p>
                    </div>
                    <button
                      className="product-arrow"
                      aria-label={`Details for ${product.name} in ${product.color}`}
                      onClick={() => openProduct(product)}
                    >
                      <Icon name="arrow" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <span aria-hidden="true">✳</span>
              <h3>
                {products.length
                  ? "No matches just yet."
                  : "Something good is on its way."}
              </h3>
              <p>
                {savedOnly && saved.length === 0
                  ? "Tap a heart on any piece to start your collection."
                  : products.length
                    ? "Try another colour, category, or search."
                    : "Check back soon for the new collection."}
              </p>
              {products.length > 0 && (
                <button className="black-button" onClick={reset}>
                  See all pieces <Icon name="arrow" />
                </button>
              )}
            </div>
          )}
        </section>
        <section id="our-story" className="story">
          <div className="story-symbol" aria-hidden="true">
            ✳
          </div>
          <div>
            <p className="eyebrow">THE FURFRAME PHILOSOPHY</p>
            <h2>
              Life with your dog.
              <br />
              As good as it looks.
            </h2>
            <p>
              We believe the best everyday things bring a little joy. A
              favourite colour, a comfortable fit, and a companion who’s always
              ready for the next adventure.
            </p>
            <a href="#collection" className="text-link">
              Find your everyday favourite <Icon name="arrow" />
            </a>
          </div>
          <div className="story-colorblocks" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
        </section>
      </main>
      <footer>
        <a className="wordmark" href="#top">
          FurFrame <span>Studio</span>
          <sup>®</sup>
        </a>
        <p>A little more colour. A little more joy.</p>
        <div className="footer-bottom">
          <span>© 2026 FurFrame Studio · Design by Jennifer Zhang</span>
          <span>A student design project · Catalogue preview</span>
          <a href="#top">Back to top ↑</a>
        </div>
      </footer>
      <dialog
        ref={dialog}
        aria-labelledby="product-dialog-title"
        className="product-dialog"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <button
          className="dialog-close icon-button"
          aria-label="Close product details"
          onClick={() => dialog.current?.close()}
        >
          <Icon name="close" />
        </button>
        {selected && (
          <div className="dialog-content">
            <div className="dialog-image">
              <Image
                src={selected.image_url}
                alt={`${selected.name} in ${selected.color}`}
                fill
                sizes="(max-width: 760px) 90vw, 450px"
              />
            </div>
            <div className="dialog-copy">
              <p className="eyebrow">
                {selected.category} / THE EVERYDAY COLLECTION
              </p>
              <h2 id="product-dialog-title">{selected.name}</h2>
              <p className="dialog-price">{money(selected.price)}</p>
              <p>{selected.description}</p>
              <div className="color-detail">
                <span style={{ backgroundColor: selected.color_hex }} />
                {selected.color}
              </div>
              <button
                className="black-button"
                onClick={() => toggleSave(selected.id)}
              >
                <Icon name="heart" filled={saved.includes(selected.id)} />
                {saved.includes(selected.id)
                  ? "Saved to your collection"
                  : "Save this piece"}
              </button>
              <p className="preview-note">
                Part of the FurFrame Studio design catalogue. Purchases are not
                available.
              </p>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
