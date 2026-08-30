# Netlify and Supabase deployment

## 1. Configure Supabase

1. Open the Supabase project SQL Editor.
2. Open `supabase/schema.sql` from this repository, paste it into the editor, and run it.
3. In Authentication > Users, create a user with this email:
   `VK5206453@gmail.com`
4. Set a private password for that user. Do not commit it to GitHub.
5. Open Storage > `publication-pdfs` after the SQL runs.
6. Upload `uploads/test-pub-101.pdf` with this exact object name:
   `test-pub-101.pdf`

The SQL creates the `publications` table, read policy, authenticated management policy, and private PDF bucket. The API accesses the database and bucket with the private server key.

## 2. Connect GitHub to Netlify

1. Upload this entire folder to a GitHub repository, including `netlify/functions`, `supabase`, and `_redirects`.
2. In Netlify, choose Add new site > Import an existing project.
3. Select the GitHub repository.
4. Use these build settings:
   - Build command: leave blank
   - Publish directory: `.`
   - Functions directory: `netlify/functions`
5. Add these environment variables in Netlify site settings:
   - `SUPABASE_URL` = `https://cowwzbnirdqyoitqukng.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = the private service-role key from Supabase Project Settings > API
6. Redeploy after saving the variables.

Never put the service-role key in GitHub, HTML, JavaScript, or chat. The publishable key in `admin.html` is intended for the browser.

## 3. Verify globally

1. Open the deployed Netlify URL and confirm the Publications page loads the seeded records.
2. Open `/admin.html`, sign in with the Supabase user, and publish a test record.
3. Open the site in a private/incognito window. The same record should appear there.
4. Test PDF viewing and deletion from the admin dashboard.

The old `server.js` and local JSON file are retained only for local reference. Netlify uses `netlify/functions/api.js` and Supabase.
