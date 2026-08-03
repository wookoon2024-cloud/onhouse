import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Vite wipes the output directory with the SYNCHRONOUS fs.rmSync(path, { recursive: true }).
    // On Node v24.12.0 for Windows that call hard-kills the process — exit code 0xC0000409
    // (STATUS_STACK_BUFFER_OVERRUN), no exception, no stack trace — whenever the path contains
    // non-ASCII characters, which this project's path does ("2026상반기\온하우스"). The symptom
    // was a build that printed "✓ N modules transformed." and then vanished before writing a
    // single file; it only ever succeeded when dist/ happened not to exist yet. Minimal repro
    // (the path does not even have to exist):
    //   node -e "require('fs').rmSync('C:/Pro1/2026상반기/온하우스/nope',{recursive:true,force:true})"
    // The async equivalent, fs.promises.rm, is unaffected on the exact same path — so the wipe is
    // handed to `npm run clean` (which uses it) and Vite is told to leave the directory alone.
    // Remove this once the project lives on an ASCII-only path or Node ships a fix.
    emptyOutDir: false
  }
})
