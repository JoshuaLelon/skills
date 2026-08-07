import { cloudflare } from '@cloudflare/vite-plugin'
import { reactRouter } from '@react-router/dev/vite'
import { defineConfig } from 'vite'

export default defineConfig({
	// A port of our own, not Vite's 5173 default. Playwright pins this exact
	// port with reuseExistingServer:false, so a collision is a hard failure —
	// correct, but a needless one when the squatter is an unrelated project that
	// merely also uses Vite. `strictPort` makes a collision fail here rather than
	// silently sliding to 5174 and leaving e2e pointed at nothing.
	server: { port: 5273, strictPort: true },
	plugins: [cloudflare({ viteEnvironment: { name: 'ssr' } }), reactRouter()],
})
