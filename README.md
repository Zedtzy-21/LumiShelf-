LumiShelf — AI-Powered E-Library System

LumiShelf is a multi-platform digital e-library built to make classic literature easy to discover, read, and organize across both Web and Android. Instead of a traditional static book list, LumiShelf pairs a curated 200+ book public-domain catalog with Lumi AI—an embedded AI assistant powered by the Google Gemini API and Supabase that connects directly to our real database to search, compare, and save books for readers.

Live Deployment (Wasmer Edge):

Web App: https://lumishelf-<your-wasmer-username>.wasmer.app (Update with your live Wasmer link)

Backend API: https://lumishelf-api-<your-wasmer-username>.wasmer.app (Update with your live Wasmer link)

Project Structure

We designed LumiShelf as a shared-backend ecosystem so both our web and mobile apps stay synchronized with the same user accounts, book catalog, and AI assistant:

LumiShelf/
├── web/          # React + Vite + Tailwind CSS web dashboard & in-app book reader
├── mobile/       # React Native (Expo) Android mobile application
├── backend/      # Node.js + Express REST API & Lumi AI agent (targeted for Wasmer Edge)
└── supabase/     # PostgreSQL database schema & migration scripts

How the System Works (Architecture)┌─────────────────────────┐      ┌─────────────────────────┐
│    /web (React + Vite)  │      │ /mobile (Expo Android)  │
│   Web Dashboard & UI    │      │   Android Mobile App    │
└────────────┬────────────┘      └────────────┬────────────┘
             │                                │
             └───────────────┬────────────────┘
                             │  HTTPS (JWT Auth / Device ID)
                             ▼
             ┌───────────────────────────────┐
             │   /backend (Node + Express)   │
             │   Targeted for Wasmer Edge    │
             └───┬───────────────────────┬───┘
                 │                       │
                 ▼                       ▼
┌────────────────────────────────┐  ┌──────────────────────────┐
│     Supabase (PostgreSQL)      │  │    Google Gemini API     │
│ • 200+ Books & Text Cache      │  │ • Lumi AI (Function      │
│ • User Auth & Role Profiles    │  │   Calling / DB Tools)    │
│ • Favorites & Download Quotas  │  │ • Fast 1–3s Responses    │
└────────────────────────────────┘  └──────────────────────────┘
Tech Stack & Why We Chose ItLayerTechnologies UsedPurpose in LumiShelfWeb Frontend (/web)React, Vite, Tailwind CSS, Lucide IconsFast single-page dashboard with responsive layouts, Dark/Light theme switching, and a distraction-free serif book reader.Android App (/mobile)React Native, ExpoCross-platform mobile experience reusing JavaScript/React concepts and sharing the exact same REST endpoints as the web app.Backend API (/backend)Node.js, Express.jsCentral REST API that validates user roles, enforces download limits, proxies book content safely, and keeps API keys hidden from client apps.Database & AuthSupabase (PostgreSQL + Auth)Stores our 200+ book catalog, user profiles (Guest, Reader, Admin), saved favorites, and download history with real-time syncing.Agentic AI (Lumi AI)Google Gemini API (@google/genai, gemini-2.5-flash)Uses Function Calling (Tools) to query real books from Supabase—preventing AI hallucinations and allowing 1-step saving to My Library.DeploymentWasmer EdgeHosts our web interface and backend API on fast edge infrastructure.Key FeaturesRole-Based Access & Download QuotasGuest Mode: Users can explore the catalog and chat with Lumi AI immediately without signing up, tracked via a local device ID with a 5-book download limit.Registered Reader: Creating a free account unlocks 10 downloads, cross-device My Library favorites, and persistent Continue Reading progress.Admin Panel: Authorized admin accounts get unlimited downloads, catalog analytics, and full CRUD tools (Add, Edit, and Delete books).Agentic "Lumi AI" AssistantUnlike a standard chatbot that only replies from general memory, Lumi AI is equipped with backend database tools (search_books, get_book_details, compare_books, and save_book_to_favorites).Readers can ask Lumi AI to recommend classics, compare two books side-by-side, or automatically save a book to their library—with adjustable chat font sizes (A- / A+) and Minimize/Maximize window controls.In-App Book Reader with Multi-Mirror FallbackInstead of sending users to external websites that might be down for maintenance, our backend streams and cleans book text through multiple Project Gutenberg mirrors and caches excerpts in Supabase so readers can open books directly inside the app.Clean, Accessible UI/UXFeatures a slide-out hamburger menu (Home, Books, My Library, Downloads, Admin Panel), a profile settings dropdown with Dark Mode (Deep Space Indigo & Amber) and Light Mode toggles, and clear visual feedback via toast notifications.Core Backend API EndpointsMethodEndpointWhat It DoesAccessGET/api/healthChecks server status, Supabase connection, book count, and Gemini key status.PublicGET/api/booksRetrieves the full catalog ordered by popularity.PublicGET/api/books/:id/readStreams cleaned, readable book chapters from mirrors or Supabase cache.PublicGET/api/downloads/quotaChecks current download usage and remaining limit (5 Guest / 10 Reader).User / GuestPOST/api/books/:id/downloadValidates quota limits and logs a new book download.User / GuestPOST/api/ai/chatProcesses user prompts with Lumi AI and executes live Supabase database tools.Public / AuthPOST / PUT / DELETE/api/admin/booksCreates, updates, or deletes books in the Supabase catalog.Admin OnlyRunning LumiShelf LocallyPrerequisitesNode.js (v18 or higher)A Supabase project (with books, profiles, favorites, and downloads tables)A Google AI Studio (Gemini) API key1. Start the Backend (/backend)cd backend
npm install
Create a .env file inside /backend:PORT=5000
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
GEMINI_API_KEY=your_gemini_api_key
ADMIN_EMAILS=your_admin_email@example.com
Run the server:npm run dev
2. Start the Web App (/web)cd web
npm install
Create a .env file inside /web:VITE_API_URL=http://localhost:5000
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
Run the Vite dev server:npm run dev
3. Start the Mobile App (/mobile)cd mobile
npm install
npx expo start
(Configure your mobile .env to point to your live Wasmer backend URL or local network IP when testing on a physical Android device.)

/web: The browser-based dashboard built with React, Vite, and Tailwind CSS. Includes a personalized Home Dashboard, searchable Books catalog, My Library favorites, Downloads tracker, Dark/Light mode, an In-App Reader, and an Admin Control Center.

/mobile: The Android companion app built with React Native (Expo). Connects to the exact same backend API and Supabase authentication so users can log in on mobile and see the same saved books and download limits as on the web.

/backend: A centralized Node.js + Express REST API that acts as the bridge between our clients, Supabase, and Google Gemini. It handles download quota enforcement, multi-mirror book text streaming, rate-limiting security, and Lumi AI's database tool calls.