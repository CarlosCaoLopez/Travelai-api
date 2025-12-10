-- Drop foreign key constraint for subcategory_id in artworks table
ALTER TABLE "artworks" DROP CONSTRAINT IF EXISTS "artworks_subcategory_id_fkey";

-- Drop index for category and subcategory
DROP INDEX IF EXISTS "artworks_category_id_subcategory_id_idx";

-- Remove subcategory_id column from artworks
ALTER TABLE "artworks" DROP COLUMN IF EXISTS "subcategory_id";

-- Drop category_relations table
DROP TABLE IF EXISTS "category_relations" CASCADE;
