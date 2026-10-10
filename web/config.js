// ============================================================================
// Configuración del sistema. Solo hay que cambiar estos valores UNA VEZ.
//
// Dónde encontrarlos: Supabase > tu proyecto > Project Settings > API
//   - Project URL            → SUPABASE_URL
//   - Project API keys: anon → SUPABASE_ANON_KEY   (la clave "anon public")
//
// La clave "anon" es pública por diseño: la seguridad la dan las reglas de la
// base de datos (supabase/schema.sql). NUNCA pegues aquí la clave "service_role".
// ============================================================================
export const SUPABASE_URL = 'https://kyspshtfnwqicftawpkt.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5c3BzaHRmbndxaWNmdGF3cGt0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1NjIxMDAsImV4cCI6MjEwNzEzODEwMH0.-ssMOZJDCvq5calhiCZPH6AlsI65x85uVplc9GSKFBw';

// WhatsApp de cada sucursal para el botón "Consultar" del catálogo público.
// Formato: código de país + número, sin espacios ni signos (ej. Bolivia: 59171234567).
// Déjalo vacío ('') para ocultar el botón de esa sucursal.
export const WHATSAPP = {
  tarija: '',
  cochabamba: '',
  santacruz: '',
};
