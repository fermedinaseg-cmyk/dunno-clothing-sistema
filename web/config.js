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
export const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
export const SUPABASE_ANON_KEY = 'PEGA-AQUI-TU-CLAVE-ANON';

// WhatsApp de cada sucursal para el botón "Consultar" del catálogo público.
// Formato: código de país + número, sin espacios ni signos (ej. Bolivia: 59171234567).
// Déjalo vacío ('') para ocultar el botón de esa sucursal.
export const WHATSAPP = {
  tarija: '',
  cochabamba: '',
  santacruz: '',
};
