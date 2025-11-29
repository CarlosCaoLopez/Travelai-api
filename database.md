-- ==========================================
-- 0. EXTENSIONES Y UTILIDADES
-- ==========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Función para mantener updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 1. TABLAS MAESTRAS (Normalización)
-- ==========================================

-- 1.1 PAÍSES (ISO 3166-1 alpha-2)
CREATE TABLE countries (
    iso_code CHAR(2) PRIMARY KEY, -- Ej: 'ES', 'IT'
    default_name TEXT NOT NULL,   -- Fallback interno
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE country_translations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    country_code CHAR(2) NOT NULL REFERENCES countries(iso_code) ON DELETE CASCADE,
    language VARCHAR(2) NOT NULL, -- ISO 639-1: 'es', 'en'
    name TEXT NOT NULL,
    UNIQUE(country_code, language)
);

-- 1.2 AUTORES (Solo Identidad)
-- Nota: Las fotos se gestionan externamente usando este ID (ej: /bucket/authors/{id}.jpg)
CREATE TABLE authors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL, -- Único dato guardado
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Se eliminó author_translations porque ya no hay biografía que traducir.

-- 1.3 CITAS DE ARTISTAS (Quotes)
CREATE TABLE artist_quotes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id UUID NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE artist_quote_translations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quote_id UUID NOT NULL REFERENCES artist_quotes(id) ON DELETE CASCADE,
    language VARCHAR(2) NOT NULL,
    text TEXT NOT NULL,
    UNIQUE(quote_id, language)
);

-- ==========================================
-- 2. SISTEMA DE CATEGORÍAS (Jerárquico)
-- ==========================================

CREATE TABLE categories (
    id TEXT PRIMARY KEY, -- Slugs: 'paintings', 'sculpture'
    type VARCHAR(20) NOT NULL CHECK (type IN ('category', 'subcategory')),
    icon TEXT NOT NULL,
    image_url TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE category_translations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    language VARCHAR(2) NOT NULL,
    name TEXT NOT NULL,
    UNIQUE(category_id, language)
);

-- Relación Padre-Hijo (Muchos a Muchos)
CREATE TABLE category_relations (
    parent_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    child_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    sort_order INTEGER DEFAULT 0,
    PRIMARY KEY (parent_id, child_id),
    CHECK (parent_id != child_id)
);

-- ==========================================
-- 3. CATÁLOGO DE OBRAS (Gold Standard)
-- ==========================================

CREATE TABLE artworks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Referencias Normalizadas
    author_id UUID NOT NULL REFERENCES authors(id) ON DELETE RESTRICT,
    country_code CHAR(2) NOT NULL REFERENCES countries(iso_code) ON DELETE RESTRICT,
    category_id TEXT NOT NULL REFERENCES categories(id),
    subcategory_id TEXT REFERENCES categories(id),

    -- Datos Fijos
    title TEXT NOT NULL,
    year VARCHAR(50),
    period VARCHAR(100),
    dimensions VARCHAR(100),
    technique VARCHAR(100),
    image_url TEXT NOT NULL, -- Imagen de alta calidad curada
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE artwork_translations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    artwork_id UUID NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
    language VARCHAR(2) NOT NULL,
    description TEXT NOT NULL,
    title_override TEXT,
    UNIQUE(artwork_id, language)
);

-- ==========================================
-- 4. USUARIOS Y SUSCRIPCIONES
-- ==========================================

CREATE TABLE users (
    id UUID PRIMARY KEY, -- Mapped to Supabase Auth UID
    email TEXT UNIQUE NOT NULL,
    
    display_name TEXT,
    avatar_url TEXT,
    preferred_language VARCHAR(2) DEFAULT 'es',
    
    -- Estado
    is_premium BOOLEAN DEFAULT FALSE,
    stripe_customer_id TEXT UNIQUE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CreateEnum
CREATE TYPE PlanType AS ENUM ('travel_pass', 'monthly', 'annual');

-- CreateEnum
CREATE TYPE SubscriptionStatus AS ENUM ('active', 'canceled', 'past_due', 'incomplete', 'expired');

CREATE TABLE subscriptions (
    id TEXT PRIMARY KEY, -- Stripe Sub ID
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status SubscriptionStatus NOT NULL DEFAULT 'incomplete',
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    plan_id PlanType NOT NULL,
    -- Datos de Facturación Solicitados
    stripe_payment_intent_id TEXT, -- Restaurado por solicitud
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 5. COLECCIÓN HÍBRIDA (El Core del Usuario)
-- ==========================================

CREATE TABLE user_collection_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- A. Referencia Oficial (Puede ser NULL)
    artwork_id UUID REFERENCES artworks(id) ON DELETE SET NULL,
    
    -- B. Evidencia (Siempre existe)
    captured_image_url TEXT NOT NULL,
    identified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- C. Datos Snapshot / Custom (Se usan si A es NULL)
    custom_title TEXT,
    custom_author TEXT,
    custom_year TEXT,
    custom_period TEXT,
    custom_technique TEXT,
    custom_dimensions TEXT,
    custom_country TEXT,
    custom_description TEXT,
    
    -- D. Metadata Técnica (Para mejora continua de IA)
    ai_analysis_data JSONB,
    
    -- Campos de auditoría (Necesarios para el trigger)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Validación lógica
    CONSTRAINT has_content CHECK (
        artwork_id IS NOT NULL OR custom_title IS NOT NULL
    )
);

-- ==========================================
-- 6. ÍNDICES Y RENDIMIENTO
-- ==========================================

-- Catálogo
CREATE INDEX idx_artworks_author ON artworks(author_id);
CREATE INDEX idx_artworks_category ON artworks(category_id, subcategory_id);
CREATE INDEX idx_authors_name ON authors(name);

-- Usuario
CREATE INDEX idx_user_collection_user ON user_collection_items(user_id);
CREATE INDEX idx_user_collection_date ON user_collection_items(identified_at DESC);
CREATE INDEX idx_user_collection_ai_data ON user_collection_items USING gin (ai_analysis_data);

-- Traducciones (Crucial para JOINs rápidos)
CREATE INDEX idx_trans_artwork_lang ON artwork_translations(artwork_id, language);
CREATE INDEX idx_trans_author_lang ON author_translations(author_id, language);

-- ==========================================
-- 7. TRIGGERS (Automatización)
-- ==========================================

CREATE TRIGGER update_authors_modtime BEFORE UPDATE ON authors FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_categories_modtime BEFORE UPDATE ON categories FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_artworks_modtime BEFORE UPDATE ON artworks FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_users_modtime BEFORE UPDATE ON users FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_collection_modtime BEFORE UPDATE ON user_collection_items FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
