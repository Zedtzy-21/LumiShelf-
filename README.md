LumiShelf is an integrated digital library ecosystem designed for Web and Android readers. It combines a curated 200+ classic book catalog, a distraction-free In-App Book Reader, and Lumi AI—an embedded agentic assistant powered by the Google Gemini API that connects directly to our Supabase database to search, compare, and save real books in seconds.

Live Deployment Links (Wasmer Edge)

Web Dashboard: https://lumishelf-<your-wasmer-username>.wasmer.app (Replace with your live Wasmer URL)

REST API Gateway: https://lumishelf-api-<your-wasmer-username>.wasmer.app (Replace with your live Wasmer URL)

Why We Built LumiShelf

Many free e-library websites feel cluttered, send users to broken external links, or lack smart discovery tools. As IT students, we built LumiShelf to solve this with a single shared backend architecture:

One Shared Book Catalog: Both the Web app and Android app load the exact same 200+ public-domain classics stored in Supabase.

Synchronized User Accounts & Quotas: Whether a user logs in on a laptop or an Android phone, their profile role, saved My Library favorites, and download limits stay in sync.

Grounded AI Assistance (Zero Hallucinations): Instead of guessing book titles, Lumi AI uses real database tools to query our catalog before recommending, comparing, or saving a book.

Repository Structure

LumiShelf/
├── web/          # React + Vite + Tailwind CSS web dashboard & in-app reader
├── mobile/       # React Native (Expo) Android mobile application
├── backend/      # Node.js + Express REST API & Lumi AI agent (Wasmer Edge ready)
├── supabase/     # PostgreSQL schema & migration scripts
└── README.md     # System documentation & setup guide


/web — Responsive web dashboard featuring a personalized Home view, searchable/sortable Books catalog, My Library favorites, Downloads quota tracker, Dark/Light theme switcher, In-App Reader, and an Admin Control Center.

/mobile — Android companion app built with React Native (Expo) that connects to the same REST API and Supabase authentication as the web client.

/backend — Centralized Node.js + Express API gateway that protects secret API keys, enforces download quotas, streams cleaned book chapters from mirrors, applies rate limiting, and runs Lumi AI's database tool loop.
