# Booksy design reference

Source: **fallback**  
Captured: 2026-07-02T13:18:30.990Z

Provenance: scraped from booksy.com via self-hosted Firecrawl when the
scrape succeeds (`source: firecrawl`); a curated Booksy-UX reference is
written when Firecrawl is unavailable or Booksy blocks the scrape
(`source: fallback`). See `scripts/scrape-booksy.mjs`.

## marketing-home

URL: https://booksy.com/en-us

Layout patterns:
- full-bleed hero with a background image + a centered, prominent search bar
- search bar: two pill inputs (service + location) + a solid primary "Search" button on the inline-end
- category circles row directly under the hero: circular icon emblem + label, horizontally scrollable on mobile
- popular professionals: salon cards (cover photo, name, star rating + review count, category, address, "from $X" price, "Book" button)
- how it works: 3 numbered steps (choose service / pick time / confirm) with icons
- app-download promo band with app store badges + a QR
- trust strip: ratings, number of bookings, "available 24/7"

Copy:
- heroTitle: Book trusted beauty pros, instantly
- heroSubtitle: Search and book appointments at top salons near you.
- searchServicePlaceholder: Service or salon name
- searchLocationPlaceholder: City or neighborhood
- searchSubmit: Search
- categoriesTitle: Popular categories
- featuredTitle: Popular professionals near you
- howItWorksTitle: How Booksy works
- appPromoTitle: Get the Booksy app

## search-results

URL: https://booksy.com/en-us/search/haircut/tehran

Layout patterns:
- sticky results header: result count + sort control (Recommended / Top rated / Price)
- filter chip row: open now, next available, price range, reviews, map view toggle
- result list: one card per salon — cover thumbnail (inline-start), name, rating + reviews, category, address, "from $X", a prominent "Book" button (inline-end)
- map toggle button swaps the list for a map with pinned salon cards
- mobile: filters collapse into a bottom sheet opened by a "Filters" chip

Copy:
- resultsLabel: {{count}} places near you
- sortLabel: Sort
- filterOpenNow: Open now
- filterNextAvailable: Next available
- filterPrice: Price
- filterReviews: Reviews
- viewMap: Map
- viewList: List
- book: Book

## business-profile

URL: https://booksy.com/en-us/biz/salon-rose/12345

Layout patterns:
- storefront hero: cover gallery + salon name + rating + category + address
- sticky inline-booking rail (desktop) / sticky bottom "Book" bar (mobile): service picker → date → time → confirm
- services list with name, duration, price, and a "Book" affordance per row
- team members row (avatar + name + role)
- reviews list with author, rating, date, text
- gallery, opening hours, NAP, map embed

