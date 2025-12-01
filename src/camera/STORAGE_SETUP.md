# Supabase Storage Setup for Camera Module

## Overview
The camera recognition module stores identified artwork images in a **private Supabase Storage bucket** with Row Level Security (RLS). This ensures users can only access their own images.

## Folder Structure
Images are organized as:
```
artworks/
  ├── {userId}/
  │   ├── {artistName}/
  │   │   ├── photo1.jpg
  │   │   ├── photo2.png
  │   │   └── ...
  │   └── {countryName}/  (for monuments/architecture)
  │       ├── monument1.jpg
  │       └── ...
```

## Configuration Steps

### 1. Create Private Bucket

1. Go to Supabase Dashboard → Storage
2. Click "New bucket"
3. Name: `artworks`
4. **Public bucket**: ❌ **OFF** (Keep it private)
5. Click "Create bucket"

### 2. Configure RLS Policy

Go to Storage → `artworks` bucket → Policies → "New Policy"

**Policy Name:** `Users can access their own images`

**Policy Definition:**
```sql
-- SELECT policy (for downloading images from frontend)
CREATE POLICY "Users can view their own images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'artworks' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
```

**Note:** The backend uses `SUPABASE_SERVICE_KEY` which already has full permissions (INSERT, DELETE, SELECT). No additional policies needed for backend operations.

### 3. Environment Variables

Add to your `.env` file:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key-here  # From Dashboard → Settings → API
SUPABASE_STORAGE_BUCKET=artworks
```

## Frontend Integration

### Accessing Images from Frontend

The API returns a **storage path**, not a public URL. The frontend must fetch images using authenticated requests:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://your-project.supabase.co',
  'your-anon-public-key' // NOT service key
);

// User must be authenticated
await supabase.auth.signInWithPassword({ email, password });

// Download image using the path from API response
const { data, error } = await supabase.storage
  .from('artworks')
  .download(storagePath); // e.g., "userId/leonardo_da_vinci/photo.jpg"

if (data) {
  const imageUrl = URL.createObjectURL(data);
  // Use imageUrl in <img src={imageUrl} />
}
```

### Creating Signed URLs (Alternative)

For temporary sharing:

```typescript
const { data } = await supabase.storage
  .from('artworks')
  .createSignedUrl(storagePath, 3600); // Valid for 1 hour

console.log(data.signedUrl); // Can be used directly in <img>
```

## Security Benefits

✅ **Private by default**: Images are not publicly accessible
✅ **RLS enforcement**: Users can only see their own images
✅ **JWT-based auth**: Frontend uses user's JWT token
✅ **Organized storage**: Easy to manage and query
✅ **Scalable**: Works with any number of users/images

## Testing RLS

To verify the policy works:

1. Upload an image via the API (as User A)
2. Try to access it from frontend (as User A): ✅ Should work
3. Try to access it from frontend (as User B): ❌ Should fail with 403

## Troubleshooting

### Error: "Row level security is not enabled"
- Enable RLS on the bucket in Supabase Dashboard

### Frontend can't download images
- Verify user is authenticated (`supabase.auth.getSession()`)
- Check the storage path format matches: `{userId}/{context}/{filename}`
- Verify RLS SELECT policy is enabled

### Images stored in wrong folder
- Check `determineContextName()` logic in CameraService
- Verify artist/country names are being sanitized correctly
