# Copilot Instructions for Kusgan Fitness Gym Frontend

## Project Overview
- This is a React + Vite dashboard for Kusgan Fitness Gym. There is no backend; all data flows are client-side or via Google Apps Script integrations.
- Main UI components are in `src/components/` and page-level views in `src/pages/`.
- Data access and API logic are in `src/api/` and `src/lib/`.
- Google Sheets integration is handled via scripts in `src/api/sheets.js` and `src/lib/gas.js`.
- The `api/` folder contains Node scripts for local data seeding and smoke testing.

## Build & Run
- Local development: `npm install` then `npm run dev` (see `README.md`).
- Production build: `npm run build`.
- Deployment is via GitHub Pages; update `vite.config.js` `base` if repo name changes.

## Key Patterns & Conventions
- Use React functional components and hooks (see `src/components/` and `src/pages/`).
- State management is local or via custom hooks (e.g., `src/utils/membersStore.js`).
- Modals and dialogs are implemented as components in `src/components/`.
- API calls to Google Sheets use wrapper functions in `src/api/sheets.js` and `src/lib/gas.js`.
- For local testing, use scripts in `scripts/` and `api/` (e.g., `scripts/seed-sample.js`).

## Integration Points
- Google Apps Script backend: see `apps-script/kusgan/Code.js` and `src/lib/gas.js` for communication patterns.
- External dependencies: React, Vite, and Google Apps Script APIs.

## Example Workflow
- To add a new member modal: create a component in `src/components/AddMemberModal.jsx`, update state logic in `src/utils/membersStore.js`, and connect to Google Sheets via `src/api/sheets.js`.

## Tips for AI Agents
- Always check for existing patterns in `src/components/` and `src/pages/` before introducing new ones.
- Prefer using the provided API wrappers for any data access.
- Reference the `README.md` for build and deployment steps.
- For new integrations, follow the structure in `src/lib/gas.js` and `apps-script/kusgan/Code.js`.

---
For questions or unclear conventions, ask for clarification or examples from the user.