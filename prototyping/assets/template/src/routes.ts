import { type RouteConfig, index, route } from '@react-router/dev/routes'

export default [
  index('screens/home.tsx'),
  route('__states', 'states.tsx'),
  // one route per screen as the slice grows — URL-addressable states are what
  // make the walkthrough, the flow tests, and the fidelity audit cheap
] satisfies RouteConfig
