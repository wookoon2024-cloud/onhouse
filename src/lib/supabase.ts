import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ymxyzmezdsnjqbtwapbp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__IDNhZB5cXnLV2RcYz-M4w_0hhy7XHr';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
