# Multipart Form Data Guide for Camera Recognition

This guide explains how to correctly send requests to the `/api/camera/recognize` endpoint using multipart/form-data.

## Backend Implementation

The endpoint uses a custom decorator `@DeviceMetadata()` to parse and validate device metadata from multipart form data.

### How it works:

1. The decorator extracts the `device_metadata` field from the request body
2. Parses it as JSON (expects a stringified JSON object)
3. Validates it against the `DeviceMetadataDto` schema
4. Returns a validated DTO instance or `undefined` if not provided

### Files:

- **Decorator**: [decorators/device-metadata.decorator.ts](./decorators/device-metadata.decorator.ts)
- **Controller**: [camera.controller.ts](./camera.controller.ts)
- **DTO**: [dto/device-metadata.dto.ts](./dto/device-metadata.dto.ts)

## Frontend Usage

### TypeScript/JavaScript Example

```typescript
// Create FormData instance
const formData = new FormData();

// 1. Append the image file
formData.append('image', imageFile);

// 2. Append device_metadata as a JSON string (IMPORTANT!)
formData.append('device_metadata', JSON.stringify({
  platform: 'ios',      // 'ios' | 'android'
  app_version: '1.0.0'  // string
}));

// 3. Send the request
const response = await fetch('https://api.artexplorer.com/api/camera/recognize?language=es', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    // DO NOT set Content-Type header - let the browser set it automatically with boundary
  },
  body: formData
});

const result = await response.json();
```

### React Native Example (Expo)

```typescript
import * as ImagePicker from 'expo-image-picker';

const pickImage = async () => {
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.8,
  });

  if (!result.canceled) {
    await uploadImage(result.assets[0]);
  }
};

const uploadImage = async (asset: ImagePicker.ImagePickerAsset) => {
  const formData = new FormData();

  // Add image file
  formData.append('image', {
    uri: asset.uri,
    type: 'image/jpeg',
    name: 'photo.jpg',
  } as any);

  // Add device metadata as JSON string
  formData.append('device_metadata', JSON.stringify({
    platform: Platform.OS,
    app_version: '1.0.0'
  }));

  try {
    const response = await apiClient.post('/api/camera/recognize?language=es', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    console.log('Recognition result:', response.data);
  } catch (error) {
    console.error('Upload failed:', error);
  }
};
```

### Axios Example

```typescript
import axios from 'axios';

const recognizeArtwork = async (imageFile: File) => {
  const formData = new FormData();
  formData.append('image', imageFile);
  formData.append('device_metadata', JSON.stringify({
    platform: 'ios',
    app_version: '1.0.0'
  }));

  const response = await axios.post(
    'https://api.artexplorer.com/api/camera/recognize',
    formData,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'multipart/form-data'
      },
      params: {
        language: 'es'
      }
    }
  );

  return response.data;
};
```

## Important Notes

### ✅ DO:

- **Stringify device_metadata**: Always use `JSON.stringify()` when appending device_metadata
- **Optional field**: device_metadata is optional - you can omit it entirely
- **Let browser set Content-Type**: In web browsers, let FormData set the multipart boundary automatically

### ❌ DON'T:

- **Don't send device_metadata as an object**: FormData will convert it to `[object Object]`
- **Don't send as nested FormData**: Use a single FormData instance
- **Don't send as separate fields**: Keep platform and app_version together in the JSON string

## Request Parameters

### Query Parameters:

- `language` (optional): ISO 639-1 language code (es, en, fr). Defaults to 'es'

### Form Fields:

- `image` (required): Image file (JPG, PNG, HEIC - max 10MB)
- `device_metadata` (optional): JSON string with device information

## Response Example

### Success - Artwork Identified:

```json
{
  "success": true,
  "identified": true,
  "artwork": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Las Meninas",
    "artist": "Diego Velázquez",
    "year": "1656",
    "period": "Spanish Baroque",
    "description": "One of the masterpieces...",
    "confidence": 0.98,
    "tags": ["Spanish Baroque", "Court Portrait"],
    "capturedImageUrl": "https://storage.../abc123.jpg",
    "identifiedAt": "2025-11-30T14:30:00Z"
  },
  "savedToCollection": true,
  "message": "Artwork successfully identified and saved to collection"
}
```

### Success - Artwork Not Identified:

```json
{
  "success": true,
  "identified": false,
  "artwork": null,
  "savedToCollection": false,
  "message": "Artwork could not be identified. Try with better lighting or a different angle."
}
```

### Error - Invalid device_metadata:

```json
{
  "statusCode": 400,
  "message": "Invalid device_metadata: platform must be one of the following values: ios, android",
  "error": "Bad Request"
}
```

## Validation Rules for device_metadata

When provided, device_metadata must follow these rules:

- `platform`: Must be either 'ios' or 'android' (optional)
- `app_version`: Must be a string (optional)

Both fields are optional within the device_metadata object.

## Troubleshooting

### Error: "property device_metadata should not exist"

**Cause**: device_metadata was sent as a plain object instead of a JSON string

**Solution**: Use `JSON.stringify()` when appending to FormData

```typescript
// ❌ Wrong
formData.append('device_metadata', { platform: 'ios' });

// ✅ Correct
formData.append('device_metadata', JSON.stringify({ platform: 'ios' }));
```

### Error: "Invalid device_metadata format: must be a valid JSON string"

**Cause**: device_metadata was sent but is not valid JSON

**Solution**: Ensure you're stringifying a proper JavaScript object

### Error: "Invalid device_metadata: platform must be one of..."

**Cause**: The platform value is not 'ios' or 'android'

**Solution**: Use only the allowed enum values

## Testing with cURL

```bash
curl -X POST "https://api.artexplorer.com/api/camera/recognize?language=es" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "image=@/path/to/image.jpg" \
  -F 'device_metadata={"platform":"ios","app_version":"1.0.0"}'
```

## Testing with Postman

1. Set method to POST
2. URL: `https://api.artexplorer.com/api/camera/recognize?language=es`
3. Headers: `Authorization: Bearer YOUR_TOKEN`
4. Body: Select "form-data"
5. Add key `image` with type "File" and select your image
6. Add key `device_metadata` with type "Text" and value: `{"platform":"ios","app_version":"1.0.0"}`
