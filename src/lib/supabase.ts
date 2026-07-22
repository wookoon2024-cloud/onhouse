import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bqpdtfppcqzyqsvaqhtu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ISx4q8JS2-sYOAVXrXlqOw_RvYbEPxX';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
