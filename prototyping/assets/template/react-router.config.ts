import type { Config } from '@react-router/dev/config'

// SPA mode: no server, instant dev — but the SAME framework as production
// (ADR-0003/0013), so screens are route modules that carry: clientLoader here
// becomes loader-in-guarded() there, with the accessor→query swap and nothing
// else. The prototype differs only in where data comes from — now literally.
export default {
  ssr: false,
  appDirectory: 'src',
} satisfies Config
