import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wiuqjdvmwnunvarlyaeh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_31bmYltT8X0IAly0UU9fJw_63DA4Nxh';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
