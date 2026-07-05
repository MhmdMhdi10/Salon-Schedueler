# Booksy.com Design Analysis

> **Research Method:** Firecrawl self-hosted integration (attempted) + web fetch analysis of Booksy.com public pages, Booksy's official blog/features documentation, brand guidelines, and third-party case studies.
>
> **Date:** June 2025
>
> **Pages Analyzed:**
> - Booksy.com home page (consumer marketplace entry)
> - Booksy Biz features and marketplace pages
> - Booksy consumer booking flow documentation
> - Booksy calendar & scheduling interface
> - Booksy branding guidelines
> - Flying Bisons case study (Booksy global website redesign)
> - Booksy 2.0 app redesign blog posts

---

## 1. Navigation Structure

### Consumer App Navigation
- **Bottom tab bar** on mobile — primary navigation pattern
- **Search-first** home screen: location-based discovery is the entry point
- **Category browsing**: organized by service type (hair, nails, barber, spa, etc.)
- **City-based pages**: dedicated discovery pages per city (e.g., `/en-us/l/hair-salons/1/new-york-city`)
- **Minimal chrome**: navigation is understated to let content breathe

### Business (Biz) App Navigation
- **Main Menu** with profile icon, calendar, and settings
- **Calendar-centric**: the calendar is the hub of the business experience
- **iOS Widget** for at-a-glance upcoming appointments
- **Tab-based** views: Calendar, Clients, Marketing, Reports

### Key Navigation Pattern Takeaways for Our Redesign
- Search and location should be the primary entry point on consumer-facing pages
- Bottom navigation on mobile with 3-4 tabs maximum
- Calendar is the central navigation hub for the owner dashboard
- Minimal header/navigation on booking flows (self-contained funnel)

---

## 2. Card Layouts

### Salon/Provider Card (Discovery)
- **Photography-forward**: large hero image takes majority of card space (16:9 or square)
- **Rating badge**: star rating prominently displayed, often as overlay on image
- **Key info hierarchy**:
  1. Business name (bold)
  2. Rating + review count
  3. Location/distance
  4. Starting price or featured service
- **Rounded corners**: modern card radius (8-12px)
- **Shadow on hover**: subtle elevation change on interaction

### Service Card (Within Salon Profile)
- **Horizontal list format**: service name + duration + price in a clean row
- **Book button**: per-service action, right-aligned (or left in RTL)
- **Category grouping**: services organized by category with expandable headers
- **Variants indicator**: shows when a service has multiple options (duration/pricing)

### Feature/Benefit Cards (Marketing)
- **Icon + headline + description** pattern
- **Clean whitespace**: generous padding
- **Numbered steps** for "How It Works" sections

---

## 3. Booking Step Flow

### Consumer Booking Steps
Based on Booksy's documented flow:

```
1. DISCOVER → Browse/search providers by location + service
2. SELECT PROVIDER → View profile, portfolio, reviews
3. SELECT SERVICE → Choose from provider's service catalog
4. SELECT STAFF → Optionally choose a specific staff member
5. SELECT DATE/TIME → Real-time availability calendar + time slots
6. CONFIRM → Review summary + apply payment/policy
7. BOOKED → Confirmation with appointment details
```

### Key Booking UX Patterns
- **Instant booking**: no back-and-forth; real-time availability shown
- **Streamlined flow**: "decluttered design" (per their 2025 redesign blog)
- **Availability markers**: clear visual indicators for open vs. booked slots
- **2-click rebooking**: past appointments can be instantly rebooked
- **Staff ratings visible during booking**: helps clients choose alternatives if preferred staff is unavailable
- **Bottom-sheet patterns**: date/time selection likely uses bottom-sheet on mobile
- **Progress indicator**: steps are clearly communicated (though implicit in flow, not always a visible stepper bar)

### Booking Policies
- Cancellation policies front-and-center on profile (recent update)
- Deposits required for high-value services
- Pre-authorization for high-risk bookings
- Automated waitlist when calendar is full

---

## 4. CTA Placement

### Primary CTAs
- **"Start free now"** / **"Book Now"**: high-contrast button, appears above the fold
- **Sticky/persistent**: primary booking CTA remains accessible during scroll
- **Full-width on mobile**: primary action buttons span the viewport width
- **Color**: Teal (#05CFA6) for action buttons — high contrast against black/white
- **Repetition**: CTA appears at hero, mid-page, and footer sections

### Secondary CTAs
- **"Learn more"** links for feature sections
- **"Explore Features"** for navigation between feature categories
- **Per-service "Book" buttons** within the salon profile

### CTA Hierarchy Pattern
```
HERO
├── Primary CTA (magenta/teal, large, centered)
├── Sub-text (supporting value prop)
│
FEATURES SECTION
├── Section CTA ("Learn more about X")
│
SOCIAL PROOF
├── No CTA (trust-building only)
│
PRICING/FINAL
├── Primary CTA repeated (same style as hero)
└── "Start free now" or "Book Now"
```

---

## 5. Color Usage

### Brand Palette
| Color | Hex | Role |
|-------|-----|------|
| Black | `#000000` | Primary text, logo, backgrounds |
| White | `#FFFFFF` | Page backgrounds, button text |
| Teal | `#05CFA6` | Action/highlight color, CTAs |

### Application Patterns
- **High-contrast foundation**: black and white dominate; teal is used sparingly for actions
- **Dark sections**: alternating dark/light section backgrounds for visual rhythm
- **Photography**: real salon photography carries most of the color — interface stays neutral
- **Minimal mid-tones**: avoids gray mush; either high contrast (black/white) or saturated action color
- **Trust/success**: green tones for confirmed states
- **Rating stars**: yellow/gold for star ratings

### Adaptation for Our NYC Palette
| Booksy Pattern | Our Adaptation |
|---------------|----------------|
| Teal (#05CFA6) for CTAs | Hot-magenta (#D81B60) for CTAs |
| Black/white foundation | Near-black (#1A1D23) / white (#FFFFFF) |
| Minimal mid-tones | Cool-gray only for borders/muted text |
| Photography carries color | Same — NYC editorial photography |
| Dark sections for rhythm | NYC noir dark theme sections |

---

## 6. Typography Hierarchy

### Booksy's Type System
- **Headlines**: Poppins Extra Bold (geometric sans-serif, bold weight 800)
- **Body text**: Proxima Nova Regular (humanist sans-serif, clean and legible)
- **Display scale**: large, confident headlines with tight tracking
- **Left/right aligned**: branding guidelines specify left or right alignment (not centered)

### Typography Patterns Observed
- **Hero headlines**: very large (likely 48-72px on desktop), bold, tight line-height
- **Section headlines**: medium scale, bold, clear hierarchy
- **Body**: readable, generous line-height, standard weight
- **Numbers/stats**: oversized display treatment for social proof metrics
- **Card text**: compact hierarchy — name (bold) > metadata (regular, muted) > price (semi-bold)

### Adaptation for Persian (Vazirmatn)
| Booksy (Poppins/Proxima Nova) | Our System (Vazirmatn) |
|-------------------------------|------------------------|
| Poppins Extra Bold (800) headlines | Vazirmatn Bold (800), tracking -0.03em |
| 48-72px hero display | 3rem-4.5rem (--font-3xl to --font-5xl) |
| Proxima Nova Regular body | Vazirmatn Regular (400), line-height 1.75 |
| Tight tracking for display | --tracking-tight: -0.03em for heroic only |
| Geometric confidence | Persian script with same boldness/energy |

---

## 7. Photography Treatment

### Booksy's Approach
- **Portfolio-first**: "Profiles with 10+ images bring in 3x more bookings"
- **Client photo gallery**: clients share real photos visible on provider profile
- **Real results**: before/after, styled hair, finished nails — authentic work
- **High quality**: bright, well-lit, professional-looking (not over-filtered)
- **Hero images**: full-bleed salon/beauty photography at the top of profiles
- **Staff photos**: each team member has a profile photo

### Photography Patterns
- **Aspect ratios**: hero images are wide (16:9 or wider), card thumbnails can be square
- **Overlays**: text overlaid on images uses a dark scrim/gradient for legibility
- **No generic stock**: emphasis on real portfolio work and authentic imagery
- **Human subjects**: beauty is about people — faces, hands, styling in progress
- **Lighting**: bright, natural-looking (warm salon lighting feel)

### NYC Editorial Adaptation
| Booksy Photography | Our NYC Direction |
|-------------------|-------------------|
| Bright, clean, portfolio-focused | High-contrast, dramatic lighting, editorial |
| Natural salon lighting | NYC salon atmosphere — moody, trendy |
| Standard beauty photography | Street-photography energy, urban context |
| Plain white/neutral backgrounds | Textured environments (brick, mirrors, neon) |
| Portfolio/result shots | Lifestyle shots — the NYC salon experience |

---

## 8. Layout Patterns

### Page Section Rhythm
Booksy uses an alternating rhythm pattern on marketing pages:

```
HERO (full-bleed, dark or image background)
│
SOCIAL PROOF (light bg, centered metrics)
│
FEATURES (alternating image-left/text-right, then reverse)
│
TESTIMONIAL (accent background, centered quote)
│
PRICING (clean grid, clear comparison)
│
FINAL CTA (contrasting section, repeat hero CTA)
```

### Grid System
- **3-column** on desktop for card grids (discovery results, features)
- **2-column** alternating for editorial/feature sections
- **Single column** for mobile with full-width cards
- **12-column base grid** for overall layout structure

### Responsive Behavior
- **Mobile-first**: all interfaces designed for phone first, enhanced for desktop
- **Cards stack vertically** on mobile
- **Navigation collapses** to bottom tab bar on mobile
- **CTAs become full-width** on mobile
- **Images go full-bleed** on mobile

---

## 9. UX Flow Sequences

### Discovery → Booking Flow
```
┌─────────────────────────────────────────────┐
│  HOME / SEARCH                              │
│  [Search bar] [Location] [Categories]       │
└─────────────────────┬───────────────────────┘
                      │
┌─────────────────────▼───────────────────────┐
│  RESULTS GRID                               │
│  [Filter chips] [Sort]                      │
│  ┌────────┐ ┌────────┐ ┌────────┐         │
│  │ Card   │ │ Card   │ │ Card   │         │
│  └────────┘ └────────┘ └────────┘         │
└─────────────────────┬───────────────────────┘
                      │
┌─────────────────────▼───────────────────────┐
│  SALON PROFILE                              │
│  [Hero gallery]                             │
│  [Name] [Rating] [Location]                │
│  [Book Now CTA]                             │
│  [Services list]                            │
│  [Reviews] [Portfolio] [About]              │
└─────────────────────┬───────────────────────┘
                      │
┌─────────────────────▼───────────────────────┐
│  BOOKING FLOW                               │
│  Step 1: Select service(s)                  │
│  Step 2: Choose date + time slot            │
│  Step 3: Confirm & book                     │
│  → Success screen                           │
└─────────────────────────────────────────────┘
```

### Owner Dashboard Flow
```
┌─────────────────────────────────────────────┐
│  CALENDAR (Hub)                             │
│  [Day/Week view] [Appointments as blocks]   │
│  [Drag-and-drop rescheduling]               │
│  [Color-coded by service type]              │
├─────────────────────────────────────────────┤
│  CLIENTS                                    │
│  [Searchable client cards]                  │
│  [History, notes, photos per client]        │
├─────────────────────────────────────────────┤
│  MARKETING                                  │
│  [Message blasts] [Promotions]              │
│  [Social media creator] [Boost]             │
├─────────────────────────────────────────────┤
│  REPORTS                                    │
│  [Revenue] [Commissions] [Performance]      │
│  [16 different report types]                │
└─────────────────────────────────────────────┘
```

---

## 10. Key Design Decisions for Implementation

Based on this analysis, the following Booksy patterns will directly inform our redesign:

### Must-Have Patterns (Direct Adaptation)
1. **Photography-forward salon cards** with rating badge overlay
2. **Service list with per-service "Book" buttons** grouped by category
3. **Real-time availability** shown as selectable time slot chips
4. **Sticky bottom CTA** on mobile booking views
5. **Search-first consumer experience** with location-based discovery
6. **Filter chips** (service type, rating, sort) on discovery pages
7. **Alternating dark/light section rhythm** on marketing pages
8. **Social proof metrics** with large numbers and trust messaging
9. **3-step booking** (service → date/time → confirm) without complexity
10. **Calendar-centric** owner dashboard with colored appointment blocks

### Adapted Patterns (NYC Twist)
1. **Bold geometric type** → Persian Vazirmatn at extra-bold with tight tracking
2. **Teal action color** → Hot-magenta (#D81B60) for NYC energy
3. **Clean minimal** → NYC editorial confidence with more drama/contrast
4. **Standard photography** → Dramatic lighting, urban context, editorial feel
5. **Light theme default** → Dark-mode-first for owner dashboard (NYC noir)
6. **Smooth scrolling** → Framer Motion scroll-triggered animations + parallax
7. **Simple transitions** → Signature celebration animation on booking success

### Patterns We Explicitly Do NOT Copy
1. Booksy's specific teal color (we use magenta)
2. Booksy's city-grid home page layout (we do parallax hero)
3. Booksy's Poppins/Proxima Nova fonts (we use Vazirmatn throughout)
4. Booksy's "Boost" paid feature promotion
5. Booksy's multi-market language switching (we're Persian-only)

---

## 11. Firecrawl Integration Notes

### Attempted Crawl Details
- **Firecrawl Status**: Self-hosted instance running at `localhost:3002`
- **API Verification**: Confirmed operational (`/` endpoint returns valid response)
- **Scrape Attempts**: Booksy.com blocks automated scraping (all engines failed: playwright, fetch)
- **Error**: `SCRAPE_ALL_ENGINES_FAILED` — "The website is blocking automated access"

### Alternative Research Method
Analysis was conducted using:
1. Web fetch of accessible Booksy pages (consumer entry, biz features, marketplace, customer app, calendar/scheduling)
2. Official Booksy blog posts documenting their 2.0 redesign
3. Booksy's published branding guidelines (colors, fonts, logo usage)
4. Flying Bisons case study on Booksy's global website project
5. Third-party analysis of Booksy's business model and UX patterns

### Recommendations for Future Firecrawl Usage
- Booksy.com specifically blocks automated crawlers; manual reference gathering is necessary
- For competitive analysis, screenshots via browser tools are more reliable than scraping
- The Firecrawl integration remains useful for scraping non-protected salon directory sites and general web research
