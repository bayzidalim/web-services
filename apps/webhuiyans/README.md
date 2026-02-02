# We Bhuiyans Backend

Fastify + Node.js backend for the We Bhuiyans family archive platform.

---

## Getting Started

```bash
npm install
npm run dev
```

Server runs on [http://localhost:4000](http://localhost:4000)

---

## Environment Variables

Create `.env` file:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
DATABASE_URL=postgresql://user:password@host:5432/database
PORT=4000

# Cloudinary Configuration
CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME
```

---

## Architecture

### Stack
- **Framework**: Fastify
- **Database**: Supabase PostgreSQL
- **Auth**: Supabase JWT verification
- **Media**: Cloudinary (images)

### Middleware
- **CORS**: Enabled for all origins (development)
- **Auth**: `requireAdmin` middleware protects admin routes
- **Multipart**: Supports file uploads up to 5MB

---

## API Endpoints

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| GET | `/api/people` | Public people data |

### Admin Endpoints (Protected)

All endpoints under `/api/admin/*` require JWT authentication.

#### Members

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/members` | List all members |
| GET | `/api/admin/members/:id` | Get member details |
| POST | `/api/admin/members` | Create member |
| PUT | `/api/admin/members/:id` | Update member |
| DELETE | `/api/admin/members/:id` | Delete member |
| GET | `/api/admin/members/:id/relations` | Get member relationships |
| PATCH | `/api/admin/members/:id/parents` | Link parent to child |

#### Marriages

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/marriages` | Create marriage |
| DELETE | `/api/admin/marriages/:id` | Delete marriage |

#### Publishing

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/publish-tree` | Export tree to static JSON |

#### Uploads (Cloudinary)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/uploads/image` | Upload image |
| DELETE | `/api/admin/uploads/image/:public_id` | Delete image |
| GET | `/api/admin/uploads/health` | Test Cloudinary connection |

---

## Image Upload

### Endpoint

```
POST /api/admin/uploads/image
Content-Type: multipart/form-data
Authorization: Bearer <jwt_token>
```

### Request

Send a multipart form with a `file` field containing the image.

### Response

```json
{
  "success": true,
  "message": "Image uploaded successfully",
  "data": {
    "public_id": "we-bhuiyans/filename_1702742892000",
    "secure_url": "https://res.cloudinary.com/dbbylgyxe/image/upload/v1702742892/we-bhuiyans/filename.jpg",
    "width": 1920,
    "height": 1080,
    "format": "jpg"
  }
}
```

### Constraints

| Constraint | Value |
|------------|-------|
| Max file size | 5 MB |
| Allowed types | JPEG, PNG, GIF, WebP, AVIF, SVG |
| Folder | `we-bhuiyans` |
| Optimization | Auto format (f_auto), Auto quality (q_auto) |

### Error Responses

| Status | Error |
|--------|-------|
| 400 | No file uploaded |
| 400 | Invalid file type |
| 400 | File too large |
| 400 | Empty file |
| 500 | Upload failed |

---

## Image Delete

### Endpoint

```
DELETE /api/admin/uploads/image/:public_id
Authorization: Bearer <jwt_token>
```

### Example

To delete `we-bhuiyans/photo_123`:

```
DELETE /api/admin/uploads/image/we-bhuiyans%2Fphoto_123
```

Note: URL-encode the `public_id` if it contains slashes.

### Response

```json
{
  "success": true,
  "message": "Image deleted successfully",
  "public_id": "we-bhuiyans/photo_123"
}
```

---

## Cloudinary Health Check

### Endpoint

```
GET /api/admin/uploads/health
Authorization: Bearer <jwt_token>
```

### Response

```json
{
  "success": true,
  "message": "Cloudinary connection healthy",
  "cloudinary": {
    "status": "ok"
  }
}
```

---

## Scripts

### Export Family Tree

```bash
node scripts/export-family-tree.js
```

Exports the family tree from the database to `frontend/public/family-tree.json`.

Features:
- Deterministic node ordering
- Schema validation
- Version increment
- Versioned snapshots

---

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   ├── database.js      # PostgreSQL connection pool
│   │   └── supabase.js      # Supabase client
│   ├── middleware/
│   │   └── auth.js          # JWT verification
│   ├── routes/
│   │   ├── admin.js         # Admin CRUD routes
│   │   ├── people.js        # Public routes
│   │   └── uploads.js       # Cloudinary upload routes
│   ├── services/
│   │   └── cloudinary.js    # Cloudinary helper functions
│   └── server.js            # Fastify app entry point
├── migrations/
│   ├── 001_create_media_tables.sql  # Table definitions
│   ├── 002_media_rls_policies.sql   # RLS policies
│   ├── 003_seed_media_data.sql      # Seed data
│   └── all_media_migrations.sql     # Combined migration
├── scripts/
│   ├── export-family-tree.js        # Tree export script
│   └── run-migration.js             # Migration runner
├── .env                              # Environment variables
└── package.json
```

---

## Database Schema

### Tables

#### photo_albums

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| title | TEXT | No | Album title |
| description | TEXT | Yes | Album description |
| cover_photo_id | UUID | Yes | FK → photos.id |
| created_by | UUID | No | Admin user who created |
| created_at | TIMESTAMPTZ | No | Creation timestamp |
| updated_at | TIMESTAMPTZ | No | Auto-updated timestamp |

#### photos

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| album_id | UUID | Yes | FK → photo_albums.id |
| public_id | TEXT | No | Cloudinary public_id (unique) |
| secure_url | TEXT | No | Cloudinary HTTPS URL |
| width | INTEGER | No | Image width in pixels |
| height | INTEGER | No | Image height in pixels |
| format | TEXT | No | Image format (jpg, png, etc.) |
| caption | TEXT | Yes | Photo caption |
| tags | TEXT[] | Yes | Array of tags |
| uploaded_by | UUID | No | Admin user who uploaded |
| created_at | TIMESTAMPTZ | No | Upload timestamp |
| updated_at | TIMESTAMPTZ | No | Auto-updated timestamp |

### Row Level Security (RLS)

| Table | Role | Permissions |
|-------|------|-------------|
| photo_albums | public/anon | SELECT only |
| photo_albums | authenticated (admin) | ALL |
| photos | public/anon | SELECT only |
| photos | authenticated (admin) | ALL |

The `is_admin()` function checks if the current user has `role = 'admin'` in the profiles table.

### Indexes

- `idx_photo_albums_created_by` - For filtering by creator
- `idx_photo_albums_created_at` - For sorting by date
- `idx_photos_album_id` - For album photo lookups
- `idx_photos_uploaded_by` - For filtering by uploader
- `idx_photos_created_at` - For sorting by date
- `idx_photos_public_id` - For Cloudinary lookups
- `idx_photos_tags` - GIN index for tag searches

---

## Migrations

### Run All Migrations

```bash
node scripts/run-migration.js
```

### Run Specific Migration

```bash
node scripts/run-migration.js 001_create_media_tables
```

### Run in Supabase Dashboard

1. Go to Supabase Dashboard → SQL Editor
2. Copy contents of `migrations/all_media_migrations.sql`
3. Run the query

### Migration Files

| File | Description |
|------|-------------|
| `001_create_media_tables.sql` | Creates photo_albums and photos tables |
| `002_media_rls_policies.sql` | Enables RLS with public read, admin write |
| `003_seed_media_data.sql` | Seeds example album and photo |
| `all_media_migrations.sql` | Combined file for easy execution |

---

## Authentication

All admin routes require a valid Supabase JWT token.

### How it works

1. Frontend authenticates via Supabase OAuth
2. Frontend sends `Authorization: Bearer <token>` header
3. Backend verifies token using Supabase service role key
4. Backend checks user role in profiles table

### Test Authentication

```bash
# Get a token (requires frontend login)
# Then test with:
curl -H "Authorization: Bearer <token>" http://localhost:4000/api/admin/health
```

---

## Deployment

### Environment Variables

Required in production:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `CLOUDINARY_URL`
- `PORT`

### Platforms

- **Railway**: Recommended for easy deployment
- **Fly.io**: Good for edge deployment
- **Render**: Free tier available

---

## Testing Upload (Without Frontend)

### Using curl

```bash
# Get JWT token from Supabase session in browser

# Health check
curl -H "Authorization: Bearer <token>" \
  http://localhost:4000/api/admin/uploads/health

# Upload image
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/image.jpg" \
  http://localhost:4000/api/admin/uploads/image

# Delete image
curl -X DELETE \
  -H "Authorization: Bearer <token>" \
  "http://localhost:4000/api/admin/uploads/image/we-bhuiyans%2Ffilename_123"
```

### Get Token from Browser

1. Log in to the admin dashboard
2. Open browser console
3. Run: `(await supabase.auth.getSession()).data.session.access_token`
4. Copy the token

---

**We Bhuiyans Backend**  
*Fastify, Supabase, Cloudinary.*
